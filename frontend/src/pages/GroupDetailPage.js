import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/App';
import { toast } from 'sonner';
import { ArrowLeft, Users, MapPin, Calendar, CheckCircle2, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';

const GroupDetailPage = ({ user, setUser }) => {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [offers, setOffers] = useState([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [userVote, setUserVote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasPaid, setHasPaid] = useState(false);

  useEffect(() => {
    fetchGroupData();
  }, [groupId, user]);

  const fetchGroupData = async () => {
    try {
      const [groupRes, membersRes, offersRes] = await Promise.all([
        axios.get(`${API}/groups/${groupId}`),
        axios.get(`${API}/groups/${groupId}/members`),
        axios.get(`${API}/groups/${groupId}/offers`)
      ]);

      setGroup(groupRes.data);
      setMembers(membersRes.data);
      setOffers(offersRes.data);

      // Check if user has paid for this group
      if (user) {
        try {
          const paymentRes = await axios.get(`${API}/users/check-payment/${groupId}`);
          setHasPaid(paymentRes.data.has_paid);
        } catch (error) {
          setHasPaid(false);
        }
      }

      // Check if user has voted
      if (user) {
        const userVotedOffer = offersRes.data.find(offer => 
          offer.votes > 0 // Simple check, in real app would check votes collection
        );
        if (userVotedOffer) {
          setUserVote(userVotedOffer.id);
        }
      }
    } catch (error) {
      toast.error('Failed to load group details');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGroup = async () => {
    if (!user) {
      toast.error('Please login to join a group');
      navigate('/');
      return;
    }

    if (!user.is_premium) {
      setShowPaymentModal(true);
      return;
    }

    try {
      setProcessing(true);
      await axios.post(`${API}/groups/${groupId}/join`);
      toast.success('Successfully joined the group!');
      fetchGroupData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to join group');
    } finally {
      setProcessing(false);
    }
  };

  const handlePayment = async () => {
    setProcessing(true);
    try {
      // Mock payment
      await axios.post(`${API}/users/upgrade-premium`);
      
      // Update user state
      const userRes = await axios.get(`${API}/auth/me`);
      setUser(userRes.data);
      
      toast.success('Payment successful! You are now a premium member.');
      setShowPaymentModal(false);
      
      // Auto join the group
      await axios.post(`${API}/groups/${groupId}/join`);
      toast.success('Successfully joined the group!');
      fetchGroupData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Payment failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleVote = async (offerId) => {
    if (!user) {
      toast.error('Please login to vote');
      return;
    }

    try {
      await axios.post(`${API}/offers/${offerId}/vote`);
      toast.success('Vote recorded successfully!');
      setUserVote(offerId);
      fetchGroupData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to vote');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="text-xl text-gray-600">Group not found</div>
      </div>
    );
  }

  const progressPercentage = (group.current_members / group.max_members) * 100;
  const isMember = members.some(m => m.user_id === user?.id);
  const winningOffer = offers.length > 0 ? offers.reduce((max, offer) => offer.votes > max.votes ? offer : max, offers[0]) : null;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/')} 
            className="mb-4"
            data-testid="back-to-home-btn"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Groups
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Group Hero */}
            <div className="bg-white rounded-2xl overflow-hidden border border-gray-200">
              <div className="relative h-80">
                <img
                  src={group.image_url}
                  alt={group.car_model}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-6 left-6 right-6">
                  <div className="flex items-center justify-between mb-2">
                    <h1 className="text-4xl font-bold text-white">{group.car_model}</h1>
                    <div className={`status-badge status-${group.status}`}>
                      {group.status}
                    </div>
                  </div>
                  <div className="flex items-center text-white/90">
                    <MapPin className="w-5 h-5 mr-2" />
                    <span className="text-lg">{group.city}</span>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center text-gray-700">
                      <Users className="w-5 h-5 mr-2" />
                      <span className="text-lg font-semibold">
                        {group.current_members} / {group.max_members} members
                      </span>
                    </div>
                    <span className="text-2xl font-bold text-[#0B5FFF]">
                      {Math.round(progressPercentage)}%
                    </span>
                  </div>
                  <Progress value={progressPercentage} className="h-3" />
                </div>

                {!isMember && group.status === 'forming' && (
                  <Button 
                    onClick={handleJoinGroup} 
                    className="w-full py-6 text-lg" 
                    disabled={processing || group.current_members >= group.max_members}
                    data-testid="join-group-btn"
                  >
                    {processing ? 'Processing...' : 'Join This Group'}
                  </Button>
                )}

                {isMember && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center" data-testid="member-badge">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mr-3" />
                    <span className="text-green-800 font-medium">You are a member of this group</span>
                  </div>
                )}
              </div>
            </div>

            {/* Dealer Offers */}
            {offers.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Dealer Offers</h2>
                <div className="space-y-4">
                  {offers.map((offer) => (
                    <Card 
                      key={offer.id} 
                      className={`border-2 ${
                        winningOffer?.id === offer.id ? 'border-[#22C55E] bg-green-50' : 'border-gray-200'
                      }`}
                      data-testid={`offer-card-${offer.id}`}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h3 className="text-xl font-bold text-gray-900">{offer.dealer_name}</h3>
                            <p className="text-3xl font-bold text-[#0B5FFF] mt-2">
                              ₹{offer.price.toLocaleString('en-IN')}
                            </p>
                          </div>
                          {winningOffer?.id === offer.id && (
                            <div className="bg-[#22C55E] text-white px-3 py-1 rounded-full text-sm font-semibold">
                              Winning
                            </div>
                          )}
                        </div>

                        <div className="space-y-2 mb-4">
                          <div className="flex items-center text-gray-700">
                            <Calendar className="w-4 h-4 mr-2" />
                            <span>Delivery: {offer.delivery_time}</span>
                          </div>
                          <div className="flex items-start text-gray-700">
                            <TrendingUp className="w-4 h-4 mr-2 mt-0.5" />
                            <span>Bonus: {offer.bonus_items}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="text-gray-600">
                            <span className="font-semibold text-lg">{offer.votes}</span> votes
                          </div>
                          {isMember && (
                            <Button
                              onClick={() => handleVote(offer.id)}
                              variant={userVote === offer.id ? 'default' : 'outline'}
                              disabled={userVote === offer.id}
                              data-testid={`vote-offer-${offer.id}-btn`}
                            >
                              {userVote === offer.id ? 'Voted' : 'Vote'}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar - Members */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl border border-gray-200 p-6 sticky top-24">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Group Members</h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {members.map((member, index) => (
                  <div key={member.id} className="flex items-center space-x-3" data-testid={`member-${index}`}>
                    <Avatar>
                      <AvatarFallback className="bg-[#0B5FFF] text-white">
                        {member.user_name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{member.user_name}</p>
                      <p className="text-xs text-gray-500 truncate">{member.user_email}</p>
                    </div>
                  </div>
                ))}

                {members.length === 0 && (
                  <div className="text-center text-gray-500 py-8">
                    No members yet. Be the first to join!
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <DialogContent data-testid="payment-modal">
          <DialogHeader>
            <DialogTitle>Upgrade to Premium</DialogTitle>
            <DialogDescription>
              Join MyApp Premium to create and join car-buying groups
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="bg-gradient-to-br from-[#0B5FFF] to-[#0951dd] text-white rounded-xl p-6 text-center">
              <div className="text-5xl font-bold mb-2">₹1,000</div>
              <div className="text-blue-100">One-time payment</div>
            </div>

            <div className="space-y-3">
              <div className="flex items-start">
                <CheckCircle2 className="w-5 h-5 text-green-600 mr-3 mt-0.5" />
                <div>
                  <div className="font-medium text-gray-900">Join unlimited groups</div>
                  <div className="text-sm text-gray-600">Access all active car-buying groups</div>
                </div>
              </div>
              <div className="flex items-start">
                <CheckCircle2 className="w-5 h-5 text-green-600 mr-3 mt-0.5" />
                <div>
                  <div className="font-medium text-gray-900">Create your own groups</div>
                  <div className="text-sm text-gray-600">Start groups for any car model</div>
                </div>
              </div>
              <div className="flex items-start">
                <CheckCircle2 className="w-5 h-5 text-green-600 mr-3 mt-0.5" />
                <div>
                  <div className="font-medium text-gray-900">Vote on dealer offers</div>
                  <div className="text-sm text-gray-600">Participate in negotiations</div>
                </div>
              </div>
            </div>

            <Button 
              onClick={handlePayment} 
              className="w-full py-6 text-lg" 
              disabled={processing}
              data-testid="pay-now-btn"
            >
              {processing ? 'Processing...' : 'Pay ₹1,000 Now'}
            </Button>

            <p className="text-xs text-center text-gray-500">
              Mock payment (no actual charges)
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GroupDetailPage;