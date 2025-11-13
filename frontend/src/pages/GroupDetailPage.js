import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/App';
import { toast } from 'sonner';
import { ArrowLeft, Users, MapPin, Calendar, CheckCircle2, TrendingUp, Car } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  const [showCarSelectionModal, setShowCarSelectionModal] = useState(false);
  const [carData, setCarData] = useState({});
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedVariant, setSelectedVariant] = useState('');
  const [selectedTransmission, setSelectedTransmission] = useState('');
  const [myPreference, setMyPreference] = useState(null);
  const [groupPreferences, setGroupPreferences] = useState([]);

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
          
          // Fetch car data for this brand
          const carDataRes = await axios.get(`${API}/car-data/${groupRes.data.brand}`);
          setCarData(carDataRes.data);
          
          // Fetch user's preference
          const prefRes = await axios.get(`${API}/groups/${groupId}/my-preference`);
          if (prefRes.data) {
            setMyPreference(prefRes.data);
          }
          
          // Fetch all group preferences
          const groupPrefRes = await axios.get(`${API}/groups/${groupId}/preferences`);
          setGroupPreferences(groupPrefRes.data);
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

    // Show car selection modal first
    setShowCarSelectionModal(true);
  };

  const handlePayment = async () => {
    if (!selectedModel || !selectedVariant || !selectedTransmission) {
      toast.error('Please select car model, variant and transmission');
      return;
    }

    setProcessing(true);
    try {
      const onRoadPrice = carData[selectedModel][selectedVariant][selectedTransmission];
      
      // Pay for this specific group with car details
      await axios.post(`${API}/users/pay-for-group/${groupId}`, {
        car_model: selectedModel,
        variant: selectedVariant,
        transmission: selectedTransmission,
        on_road_price: onRoadPrice
      });
      
      toast.success('Payment successful!');
      setHasPaid(true);
      setShowCarSelectionModal(false);
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

  const handleSaveCarPreference = async () => {
    if (!selectedModel || !selectedVariant) {
      toast.error('Please select both car model and variant');
      return;
    }

    try {
      setProcessing(true);
      await axios.post(`${API}/groups/${groupId}/preferences`, {
        car_model: selectedModel,
        variant: selectedVariant
      });
      toast.success('Car preference saved successfully!');
      setShowCarSelectionModal(false);
      fetchGroupData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save preference');
    } finally {
      setProcessing(false);
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
              <div className="relative brand-logo-hero">
                <img
                  src={group.image_url}
                  alt={group.car_model}
                  className="w-full h-full"
                />
                <div className="absolute top-6 right-6">
                  <div className={`status-badge status-${group.status}`}>
                    {group.status}
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="mb-4">
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">{group.car_model}</h1>
                  <div className="flex items-center text-gray-600">
                    <MapPin className="w-5 h-5 mr-2" />
                    <span className="text-lg">{group.city}</span>
                  </div>
                </div>

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

                {isMember && myPreference && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4" data-testid="member-badge">
                    <div className="flex items-center">
                      <CheckCircle2 className="w-5 h-5 text-green-600 mr-3" />
                      <div>
                        <span className="text-green-800 font-medium">You are a member of this group</span>
                        <div className="text-sm text-green-700 mt-1">
                          <Car className="w-3 h-3 inline mr-1" />
                          {myPreference.car_model} - {myPreference.variant}
                          <span className="ml-2 text-gray-600">
                            (₹{(myPreference.on_road_price / 100000).toFixed(2)} Lakh)
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {isMember && !myPreference && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4" data-testid="member-badge">
                    <div className="flex items-center">
                      <CheckCircle2 className="w-5 h-5 text-green-600 mr-3" />
                      <span className="text-green-800 font-medium">You are a member of this group</span>
                    </div>
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
                {members.map((member, index) => {
                  const memberPref = groupPreferences.find(p => p.user_id === member.user_id);
                  return (
                    <div key={member.id} className="flex items-start space-x-3" data-testid={`member-${index}`}>
                      <Avatar>
                        <AvatarFallback className="bg-[#0B5FFF] text-white">
                          {member.user_name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{member.user_name}</p>
                        <p className="text-xs text-gray-500 truncate">{member.user_email}</p>
                        {memberPref && (
                          <div className="mt-1 text-xs">
                            <div className="text-[#0B5FFF] font-medium">
                              <Car className="w-3 h-3 inline mr-1" />
                              {memberPref.car_model} - {memberPref.variant}
                            </div>
                            <div className="text-gray-500">
                              ₹{(memberPref.on_road_price / 100000).toFixed(2)} Lakh
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

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

      {/* Car Selection Modal */}
      <Dialog open={showCarSelectionModal} onOpenChange={setShowCarSelectionModal}>
        <DialogContent data-testid="car-selection-modal" className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Your Car & Variant</DialogTitle>
            <DialogDescription>
              Choose the specific car model and variant you want to buy from {group?.car_model}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="car-model">Car Model</Label>
              <Select 
                value={selectedModel} 
                onValueChange={(value) => {
                  setSelectedModel(value);
                  setSelectedVariant('');
                  setSelectedTransmission('');
                }}
              >
                <SelectTrigger id="car-model" data-testid="car-model-select">
                  <SelectValue placeholder="Select car model" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(carData).map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedModel && (
              <div>
                <Label htmlFor="variant">Variant</Label>
                <Select value={selectedVariant} onValueChange={(value) => {
                  setSelectedVariant(value);
                  setSelectedTransmission('');
                }}>
                  <SelectTrigger id="variant" data-testid="variant-select">
                    <SelectValue placeholder="Select variant" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(carData[selectedModel] || {}).map((variant) => (
                      <SelectItem key={variant} value={variant}>
                        {variant}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedModel && selectedVariant && (
              <div>
                <Label htmlFor="transmission">Transmission</Label>
                <Select value={selectedTransmission} onValueChange={setSelectedTransmission}>
                  <SelectTrigger id="transmission" data-testid="transmission-select">
                    <SelectValue placeholder="Select transmission" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(carData[selectedModel]?.[selectedVariant] || {}).map((transmission) => (
                      <SelectItem key={transmission} value={transmission}>
                        {transmission}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedModel && selectedVariant && selectedTransmission && carData[selectedModel]?.[selectedVariant]?.[selectedTransmission] && (
              <>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start">
                      <Car className="w-5 h-5 text-blue-600 mr-3 mt-0.5" />
                      <div>
                        <div className="font-semibold text-gray-900">Your Selection</div>
                        <div className="text-sm text-gray-700 mt-1">
                          {selectedModel} - {selectedVariant} ({selectedTransmission})
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-blue-200">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-gray-600">On-Road Price:</span>
                      <span className="text-lg font-bold text-gray-900">
                        ₹{(carData[selectedModel][selectedVariant][selectedTransmission] / 100000).toFixed(2)} Lakh
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Joining Amount:</span>
                      <span className="text-xl font-bold text-[#0B5FFF]">
                        ₹{(() => {
                          const price = carData[selectedModel][selectedVariant][selectedTransmission];
                          if (price <= 1000000) return '1,000';
                          if (price <= 2000000) return '2,000';
                          if (price <= 3000000) return '3,000';
                          return '5,000';
                        })()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 text-xs text-gray-600 bg-gray-50 p-3 rounded-lg">
                  <div className="flex items-start">
                    <CheckCircle2 className="w-3 h-3 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Join bulk negotiation group</span>
                  </div>
                  <div className="flex items-start">
                    <CheckCircle2 className="w-3 h-3 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Vote on best dealer offers</span>
                  </div>
                  <div className="flex items-start">
                    <CheckCircle2 className="w-3 h-3 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Save thousands with group discounts</span>
                  </div>
                </div>

                <Button 
                  onClick={handlePayment} 
                  className="w-full py-6 text-lg" 
                  disabled={processing}
                  data-testid="pay-now-btn"
                >
                  {processing ? 'Processing...' : `Pay ₹${(() => {
                    const price = carData[selectedModel][selectedVariant][selectedTransmission];
                    if (price <= 1000000) return '1,000';
                    if (price <= 2000000) return '2,000';
                    if (price <= 3000000) return '3,000';
                    return '5,000';
                  })()} & Join Now`}
                </Button>

                <p className="text-xs text-center text-gray-500">
                  Mock payment (no actual charges)
                </p>
              </>
            )}

            {(!selectedModel || !selectedVariant || !selectedTransmission) && (
              <p className="text-sm text-center text-gray-500 py-4">
                Select car model, variant and transmission to see pricing
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GroupDetailPage;