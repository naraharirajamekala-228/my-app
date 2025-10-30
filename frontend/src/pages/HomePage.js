import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/App';
import { toast } from 'sonner';
import { Search, Filter, Users, MapPin, Car } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';

const HomePage = ({ user, setUser }) => {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [filteredGroups, setFilteredGroups] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const brands = ['All', 'Tata', 'Mahindra', 'Kia', 'Hyundai', 'Maruti'];

  useEffect(() => {
    fetchGroups();
  }, []);

  useEffect(() => {
    filterGroups();
  }, [searchQuery, selectedBrand, groups]);

  const fetchGroups = async () => {
    try {
      const response = await axios.get(`${API}/groups`);
      setGroups(response.data);
      setFilteredGroups(response.data);
    } catch (error) {
      toast.error('Failed to load groups');
    }
  };

  const filterGroups = () => {
    let filtered = [...groups];

    if (selectedBrand !== 'all') {
      filtered = filtered.filter(g => g.brand.toLowerCase() === selectedBrand.toLowerCase());
    }

    if (searchQuery) {
      filtered = filtered.filter(g => 
        g.car_model.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.brand.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredGroups(filtered);
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register';
      const payload = authMode === 'login' 
        ? { email: authForm.email, password: authForm.password }
        : authForm;

      const response = await axios.post(`${API}${endpoint}`, payload);
      localStorage.setItem('token', response.data.token);
      setUser(response.data.user);
      setShowAuthModal(false);
      toast.success(authMode === 'login' ? 'Logged in successfully!' : 'Account created successfully!');
      setAuthForm({ name: '', email: '', password: '' });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    toast.success('Logged out successfully');
  };

  const handleGroupClick = (groupId) => {
    navigate(`/group/${groupId}`);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-[#0B5FFF] to-[#0951dd] rounded-xl flex items-center justify-center">
                <Car className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[#111827]">MyApp</h1>
                <p className="text-xs text-gray-500">Power of the Crowd. Price of the Deal.</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {user ? (
                <>
                  {user.is_admin && (
                    <Button 
                      onClick={() => navigate('/admin')} 
                      variant="outline" 
                      size="sm"
                      data-testid="admin-dashboard-btn"
                    >
                      Admin Dashboard
                    </Button>
                  )}
                  <span className="text-sm font-medium text-gray-700">{user.name}</span>
                  <Button onClick={handleLogout} variant="outline" size="sm" data-testid="logout-btn">
                    Logout
                  </Button>
                </>
              ) : (
                <Button onClick={() => setShowAuthModal(true)} data-testid="login-btn">
                  Login / Sign Up
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="bg-gradient-to-br from-[#0B5FFF] to-[#0951dd] text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl sm:text-5xl font-bold mb-4">India's First Group Car-Buying Platform</h2>
          <p className="text-lg sm:text-xl text-blue-100 mb-8">Unite with buyers. Negotiate better. Save more.</p>
          
          {/* Search Bar */}
          <div className="max-w-2xl mx-auto relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              data-testid="search-input"
              type="text"
              placeholder="Find your car group (e.g., Tata Safari, Hyderabad)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 py-6 text-base bg-white"
            />
          </div>
        </div>
      </div>

      {/* Brand Filters */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center space-x-2 overflow-x-auto">
            <Filter className="w-5 h-5 text-gray-500 flex-shrink-0" />
            {brands.map((brand) => (
              <button
                key={brand}
                data-testid={`filter-${brand.toLowerCase()}-btn`}
                onClick={() => setSelectedBrand(brand.toLowerCase())}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedBrand === brand.toLowerCase()
                    ? 'bg-[#0B5FFF] text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {brand}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Groups Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h3 className="text-2xl font-bold text-gray-900">Active Groups</h3>
          <p className="text-gray-600 mt-1">{filteredGroups.length} groups available</p>
        </div>

        {filteredGroups.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-gray-400 text-lg">No groups found matching your criteria</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredGroups.map((group) => (
              <div
                key={group.id}
                data-testid={`group-card-${group.id}`}
                onClick={() => handleGroupClick(group.id)}
                className="bg-white rounded-2xl overflow-hidden border border-gray-200 card-hover cursor-pointer"
              >
                <div className="relative h-48 overflow-hidden">
                  <img
                    src={group.image_url}
                    alt={group.car_model}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-3 right-3">
                    <div className={`status-badge status-${group.status}`}>
                      {group.status}
                    </div>
                  </div>
                </div>

                <div className="p-5">
                  <h4 className="text-xl font-bold text-gray-900 mb-1">{group.car_model}</h4>
                  <div className="flex items-center text-sm text-gray-600 mb-4">
                    <MapPin className="w-4 h-4 mr-1" />
                    {group.city}
                  </div>

                  <div className="mb-3">
                    <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                      <span className="flex items-center">
                        <Users className="w-4 h-4 mr-1" />
                        {group.current_members} / {group.max_members} members
                      </span>
                      <span className="font-semibold text-[#0B5FFF]">
                        {Math.round((group.current_members / group.max_members) * 100)}%
                      </span>
                    </div>
                    <Progress 
                      value={(group.current_members / group.max_members) * 100} 
                      className="h-2"
                    />
                  </div>

                  <Button 
                    data-testid={`join-group-${group.id}-btn`}
                    className="w-full" 
                    disabled={group.current_members >= group.max_members}
                  >
                    {group.current_members >= group.max_members ? 'Group Full' : 'View Details'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Auth Modal */}
      <Dialog open={showAuthModal} onOpenChange={setShowAuthModal}>
        <DialogContent data-testid="auth-modal">
          <DialogHeader>
            <DialogTitle>{authMode === 'login' ? 'Login' : 'Create Account'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAuth} className="space-y-4">
            {authMode === 'register' && (
              <div>
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  data-testid="auth-name-input"
                  type="text"
                  value={authForm.name}
                  onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                  required
                />
              </div>
            )}

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                data-testid="auth-email-input"
                type="email"
                value={authForm.email}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                data-testid="auth-password-input"
                type="password"
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading} data-testid="auth-submit-btn">
              {loading ? 'Processing...' : authMode === 'login' ? 'Login' : 'Sign Up'}
            </Button>
          </form>

          <div className="text-center text-sm text-gray-600 mt-4">
            {authMode === 'login' ? (
              <>
                Don't have an account?{' '}
                <button
                  data-testid="switch-to-register-btn"
                  type="button"
                  onClick={() => setAuthMode('register')}
                  className="text-[#0B5FFF] font-medium hover:underline"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  data-testid="switch-to-login-btn"
                  type="button"
                  onClick={() => setAuthMode('login')}
                  className="text-[#0B5FFF] font-medium hover:underline"
                >
                  Login
                </button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HomePage;