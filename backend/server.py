from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi import status as http_status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
SECRET_KEY = os.environ.get('JWT_SECRET', 'myapp-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 10080  # 7 days

security = HTTPBearer()

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ============= MODELS =============

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: EmailStr
    is_premium: bool = False
    is_admin: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Group(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    car_model: str
    brand: str
    city: str
    image_url: str
    max_members: int
    current_members: int = 0
    status: str = "forming"  # forming, locked, negotiation, completed
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class GroupCreate(BaseModel):
    car_model: str
    brand: str
    city: str
    image_url: str
    max_members: int

class GroupMember(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    group_id: str
    user_id: str
    user_name: str
    user_email: str
    joined_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class DealerOffer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    group_id: str
    dealer_name: str
    price: float
    delivery_time: str
    bonus_items: str
    votes: int = 0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class DealerOfferCreate(BaseModel):
    dealer_name: str
    price: float
    delivery_time: str
    bonus_items: str

class Vote(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    offer_id: str
    group_id: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class Payment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    group_id: str
    amount: float
    car_model: str
    variant: str
    transmission: str  # Manual or Automatic
    on_road_price: float
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class CarPreference(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    group_id: str
    user_name: str
    car_model: str
    variant: str
    transmission: str  # Manual or Automatic
    on_road_price: float
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class CarPreferenceCreate(BaseModel):
    car_model: str
    variant: str
    transmission: str
    on_road_price: float

# ============= HELPER FUNCTIONS =============

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return User(**user)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_admin_user(current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

# ============= AUTH ROUTES =============

@api_router.post("/auth/register")
async def register(user_data: UserCreate):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    user = User(
        name=user_data.name,
        email=user_data.email,
        is_premium=False,
        is_admin=False
    )
    
    user_dict = user.model_dump()
    user_dict['password_hash'] = hash_password(user_data.password)
    
    await db.users.insert_one(user_dict)
    
    # Create token
    access_token = create_access_token(data={"sub": user.id})
    
    return {
        "user": user,
        "token": access_token
    }

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    # Find user
    user_doc = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Verify password
    if not verify_password(credentials.password, user_doc['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    user = User(**user_doc)
    
    # Create token
    access_token = create_access_token(data={"sub": user.id})
    
    return {
        "user": user,
        "token": access_token
    }

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

# ============= USER ROUTES =============

class PaymentCreate(BaseModel):
    car_model: str
    variant: str
    transmission: str
    on_road_price: float

@api_router.post("/users/pay-for-group/{group_id}")
async def pay_for_group(group_id: str, payment_data: PaymentCreate, current_user: User = Depends(get_current_user)):
    # Check if group exists
    group = await db.groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Check if already paid for this group
    existing_payment = await db.payments.find_one(
        {"user_id": current_user.id, "group_id": group_id},
        {"_id": 0}
    )
    if existing_payment:
        raise HTTPException(status_code=400, detail="Already paid for this group")
    
    # Calculate payment amount based on on-road price
    on_road_price = payment_data.on_road_price
    if on_road_price <= 1000000:  # 0-10 lakhs
        amount = 1000.0
    elif on_road_price <= 2000000:  # 10-20 lakhs
        amount = 2000.0
    elif on_road_price <= 3000000:  # 20-30 lakhs
        amount = 3000.0
    else:  # 30+ lakhs
        amount = 5000.0
    
    # Mock payment - create payment record
    payment = Payment(
        user_id=current_user.id,
        group_id=group_id,
        amount=amount,
        car_model=payment_data.car_model,
        variant=payment_data.variant,
        transmission=payment_data.transmission,
        on_road_price=on_road_price
    )
    await db.payments.insert_one(payment.model_dump())
    
    return {"message": "Payment successful", "payment_id": payment.id, "amount": amount}

@api_router.get("/users/check-payment/{group_id}")
async def check_group_payment(group_id: str, current_user: User = Depends(get_current_user)):
    payment = await db.payments.find_one(
        {"user_id": current_user.id, "group_id": group_id},
        {"_id": 0}
    )
    return {"has_paid": payment is not None}

# ============= GROUP ROUTES =============

@api_router.get("/groups", response_model=List[Group])
async def get_groups(brand: Optional[str] = None, city: Optional[str] = None, search: Optional[str] = None):
    query = {}
    if brand:
        query["brand"] = brand
    if city:
        query["city"] = city
    if search:
        query["$or"] = [
            {"car_model": {"$regex": search, "$options": "i"}},
            {"brand": {"$regex": search, "$options": "i"}},
            {"city": {"$regex": search, "$options": "i"}}
        ]
    
    groups = await db.groups.find(query, {"_id": 0}).to_list(1000)
    return [Group(**g) for g in groups]

@api_router.get("/groups/{group_id}", response_model=Group)
async def get_group(group_id: str):
    group = await db.groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return Group(**group)

@api_router.post("/groups", response_model=Group)
async def create_group(group_data: GroupCreate, current_user: User = Depends(get_current_user)):
    group = Group(**group_data.model_dump())
    await db.groups.insert_one(group.model_dump())
    
    return group

@api_router.post("/groups/{group_id}/join")
async def join_group(group_id: str, current_user: User = Depends(get_current_user)):
    # Check if user has paid for this group
    payment = await db.payments.find_one(
        {"user_id": current_user.id, "group_id": group_id},
        {"_id": 0}
    )
    if not payment:
        raise HTTPException(status_code=403, detail="Payment required to join this group")
    
    # Check if group exists
    group = await db.groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    group_obj = Group(**group)
    
    # Check if group is full
    if group_obj.current_members >= group_obj.max_members:
        raise HTTPException(status_code=400, detail="Group is full")
    
    # Check if already a member
    existing_member = await db.group_members.find_one(
        {"group_id": group_id, "user_id": current_user.id},
        {"_id": 0}
    )
    if existing_member:
        raise HTTPException(status_code=400, detail="Already a member of this group")
    
    # Add member
    member = GroupMember(
        group_id=group_id,
        user_id=current_user.id,
        user_name=current_user.name,
        user_email=current_user.email
    )
    await db.group_members.insert_one(member.model_dump())
    
    # Save car preference from payment
    car_preference = CarPreference(
        user_id=current_user.id,
        group_id=group_id,
        user_name=current_user.name,
        car_model=payment["car_model"],
        variant=payment["variant"],
        transmission=payment["transmission"],
        on_road_price=payment["on_road_price"]
    )
    await db.car_preferences.insert_one(car_preference.model_dump())
    
    # Update group member count
    new_count = group_obj.current_members + 1
    update_data = {"current_members": new_count}
    
    # Auto-lock if full
    if new_count >= group_obj.max_members:
        update_data["status"] = "locked"
    
    await db.groups.update_one(
        {"id": group_id},
        {"$set": update_data}
    )
    
    return {"message": "Successfully joined group", "current_members": new_count}

@api_router.get("/groups/{group_id}/members", response_model=List[GroupMember])
async def get_group_members(group_id: str):
    members = await db.group_members.find({"group_id": group_id}, {"_id": 0}).to_list(1000)
    return [GroupMember(**m) for m in members]

# ============= CAR PREFERENCE ROUTES =============

@api_router.post("/groups/{group_id}/preferences")
async def save_car_preference(
    group_id: str, 
    preference_data: CarPreferenceCreate, 
    current_user: User = Depends(get_current_user)
):
    # Check if user is a member of the group
    is_member = await db.group_members.find_one(
        {"group_id": group_id, "user_id": current_user.id},
        {"_id": 0}
    )
    if not is_member:
        raise HTTPException(status_code=403, detail="Must be a group member to save preferences")
    
    # Check if preference already exists
    existing_pref = await db.car_preferences.find_one(
        {"group_id": group_id, "user_id": current_user.id},
        {"_id": 0}
    )
    
    if existing_pref:
        # Update existing preference
        await db.car_preferences.update_one(
            {"id": existing_pref["id"]},
            {"$set": {
                "car_model": preference_data.car_model,
                "variant": preference_data.variant
            }}
        )
        return {"message": "Car preference updated successfully"}
    else:
        # Create new preference
        preference = CarPreference(
            user_id=current_user.id,
            group_id=group_id,
            user_name=current_user.name,
            car_model=preference_data.car_model,
            variant=preference_data.variant
        )
        await db.car_preferences.insert_one(preference.model_dump())
        return {"message": "Car preference saved successfully", "preference": preference}

@api_router.get("/groups/{group_id}/preferences", response_model=List[CarPreference])
async def get_group_preferences(group_id: str):
    preferences = await db.car_preferences.find({"group_id": group_id}, {"_id": 0}).to_list(1000)
    return [CarPreference(**p) for p in preferences]

@api_router.get("/groups/{group_id}/my-preference")
async def get_my_preference(group_id: str, current_user: User = Depends(get_current_user)):
    preference = await db.car_preferences.find_one(
        {"group_id": group_id, "user_id": current_user.id},
        {"_id": 0}
    )
    if preference:
        return CarPreference(**preference)
    return None

# Car models, variants, transmissions and on-road prices (in INR) - Hyderabad
# COMPREHENSIVE DATABASE - ALL MODELS, ALL VARIANTS
CAR_DATA = {
    "Tata": {
        # TATA TIAGO - Entry Hatchback (9 variants)
        "Tiago": {
            "XE Petrol": {"Manual": 547000},
            "XM Petrol": {"Manual": 637000},
            "XT Petrol": {"Manual": 696000},
            "XE CNG": {"Manual": 659000},
            "XM CNG": {"Manual": 808000},
            "XT CNG": {"Manual": 879000},
            "XZ Plus Petrol": {"Manual": 809000},
            "XZA AMT Petrol": {"AMT": 826000},
            "XZ CNG": {"Manual": 874000}
        },
        # TATA TIGOR - Compact Sedan (13 variants)
        "Tigor": {
            "XM Petrol": {"Manual": 717000},
            "XT Petrol": {"Manual": 811000},
            "XTA AMT Petrol": {"AMT": 826000},
            "XZ Petrol": {"Manual": 881000},
            "XZA AMT Petrol": {"AMT": 893000},
            "XT CNG": {"Manual": 929000},
            "XZ Plus Petrol": {"Manual": 951000},
            "XZ CNG": {"Manual": 999000},
            "XZ Plus Lux Petrol": {"Manual": 1009000},
            "XZA AMT CNG": {"AMT": 1066000},
            "XZ Plus CNG": {"Manual": 1069000},
            "XZ Plus Lux CNG": {"Manual": 1127000},
            "XZA Plus AMT CNG": {"AMT": 1137000}
        },
        # TATA ALTROZ - Premium Hatchback (22 variants)
        "Altroz": {
            "Smart Petrol": {"Manual": 704000},
            "Pure Petrol": {"Manual": 785000},
            "Smart CNG": {"Manual": 806000},
            "Creative Petrol": {"Manual": 887000},
            "Pure CNG": {"Manual": 898000},
            "Pure Diesel": {"Manual": 904000},
            "Creative CNG": {"Manual": 1000000},
            "Creative Diesel": {"Manual": 1020000},
            "Creative Plus Petrol": {"Manual": 960000, "DCA": 1060000},
            "Creative Plus Diesel": {"Manual": 1100000, "DCA": 1200000},
            "Accomplished Petrol": {"Manual": 1040000, "DCA": 1140000},
            "Accomplished Diesel": {"Manual": 1180000, "DCA": 1280000},
            "Accomplished Plus Petrol": {"Manual": 1120000, "DCA": 1220000},
            "Accomplished Plus Diesel": {"Manual": 1260000, "DCA": 1360000}
        },
        # TATA PUNCH - Micro SUV (35 variants - showing key variants)
        "Punch": {
            "Pure Petrol": {"Manual": 670000, "AMT": 770000},
            "Adventure Petrol": {"Manual": 750000, "AMT": 850000},
            "Adventure Rhythm Petrol": {"Manual": 800000, "AMT": 900000},
            "Accomplished Petrol": {"Manual": 870000, "AMT": 970000},
            "Creative Petrol": {"Manual": 940000, "AMT": 1040000},
            "Creative Plus Petrol": {"Manual": 1010000, "AMT": 1110000},
            "Pure CNG": {"Manual": 780000},
            "Adventure CNG": {"Manual": 860000},
            "Accomplished CNG": {"Manual": 980000},
            "Creative Plus Camo AMT": {"AMT": 1120000},
            "Accomplished Plus S Camo CNG": {"Manual": 930000}
        },
        # TATA NEXON - Compact SUV (40+ variants from earlier search)
        "Nexon": {
            "Smart Petrol": {"Manual": 881000},
            "Smart Plus Petrol": {"Manual": 919000},
            "Smart Plus S Petrol": {"Manual": 949000},
            "Smart Plus AMT Petrol": {"AMT": 960000},
            "Smart Plus S AMT Petrol": {"AMT": 990000},
            "Pure Plus Petrol": {"Manual": 969000},
            "Pure Plus S Petrol": {"Manual": 1000000},
            "Pure Plus AMT Petrol": {"AMT": 1040000},
            "Pure Plus S AMT Petrol": {"AMT": 1070000},
            "Creative Petrol": {"Manual": 1100000},
            "Creative Plus S Petrol": {"Manual": 1130000},
            "Creative Plus S Dark Petrol": {"Manual": 1170000},
            "Creative Plus S AMT Petrol": {"AMT": 1200000},
            "Creative DCA Petrol": {"DCA": 1220000},
            "Creative Plus PS DT Petrol": {"Manual": 1230000},
            "Creative Plus S Dark AMT Petrol": {"AMT": 1240000},
            "Creative Plus PS Dark Petrol": {"Manual": 1270000},
            "Fearless Plus PS DT Petrol": {"Manual": 1330000},
            "Fearless Plus PS Dark Petrol": {"Manual": 1350000},
            "Creative Plus PS DT DCA Petrol": {"DCA": 1350000},
            "Creative Plus PS Dark DCA Petrol": {"DCA": 1390000},
            "Fearless Plus PS DT DCA Petrol": {"DCA": 1450000},
            "Fearless Plus PS Dark DCA Petrol": {"DCA": 1470000},
            "Smart Plus Diesel": {"Manual": 1083000},
            "Smart Plus S Diesel": {"Manual": 1113000},
            "Pure Plus Diesel": {"Manual": 1100000},
            "Pure Plus S Diesel": {"Manual": 1130000},
            "Pure Plus Diesel AMT": {"AMT": 1170000},
            "Creative Plus S Diesel AMT": {"AMT": 1207000},
            "Creative Diesel": {"Manual": 1240000},
            "Creative Plus S Diesel": {"Manual": 1270000},
            "Creative Diesel AMT": {"AMT": 1310000},
            "Creative Plus S Dark Diesel": {"Manual": 1310000},
            "Creative Plus PS DT Diesel": {"Manual": 1370000},
            "Creative Plus S Dark Diesel AMT": {"AMT": 1380000},
            "Creative Plus PS Dark Diesel": {"Manual": 1410000},
            "Creative Plus PS DT Diesel AMT": {"AMT": 1440000},
            "Fearless Plus PS DT Diesel": {"Manual": 1470000},
            "Fearless Plus PS Dark Diesel": {"Manual": 1490000},
            "Fearless Plus PS DT Diesel AMT": {"AMT": 1540000},
            "Fearless Plus PS Dark Diesel AMT": {"AMT": 1560000}
        },
        # TATA CURVV - Coupe SUV (estimated 15+ variants)
        "Curvv": {
            "Smart Petrol": {"Manual": 1050000, "DCA": 1150000},
            "Pure Petrol": {"Manual": 1130000, "DCA": 1230000},
            "Creative Petrol": {"Manual": 1210000, "DCA": 1310000},
            "Creative Plus Petrol": {"Manual": 1290000, "DCA": 1390000},
            "Accomplished Petrol": {"Manual": 1370000, "DCA": 1470000},
            "Accomplished Plus Petrol": {"Manual": 1460000, "DCA": 1560000},
            "Creative Diesel": {"Manual": 1350000, "Automatic": 1450000},
            "Creative Plus Diesel": {"Manual": 1430000, "Automatic": 1530000},
            "Accomplished Diesel": {"Manual": 1510000, "Automatic": 1610000},
            "Accomplished Plus Diesel": {"Manual": 1600000, "Automatic": 1700000}
        },
        # TATA HARRIER - Mid-Size SUV (14 variants)
        "Harrier": {
            "Smart Diesel": {"Manual": 1650000, "Automatic": 1850000},
            "Pure Diesel": {"Manual": 1780000, "Automatic": 1980000},
            "Pure Plus Diesel": {"Manual": 1870000, "Automatic": 2070000},
            "Adventure Diesel": {"Manual": 1950000, "Automatic": 2150000},
            "Adventure Plus Diesel": {"Manual": 2050000, "Automatic": 2250000},
            "Adventure Plus A Diesel": {"Automatic": 2330000},
            "Fearless Diesel": {"Manual": 2180000, "Automatic": 2380000},
            "Fearless Plus Diesel": {"Manual": 2280000, "Automatic": 2480000},
            "Fearless Plus Dark Diesel": {"Automatic": 2540000}
        },
        # TATA SAFARI - 7-Seater SUV (14 variants)
        "Safari": {
            "Smart Diesel": {"Manual": 1770000, "Automatic": 1970000},
            "Pure Diesel": {"Manual": 1920000, "Automatic": 2120000},
            "Pure Plus Diesel": {"Manual": 2010000, "Automatic": 2210000},
            "Adventure Diesel": {"Manual": 2080000, "Automatic": 2280000},
            "Adventure Plus Diesel": {"Manual": 2200000, "Automatic": 2400000},
            "Adventure Plus A Diesel": {"Automatic": 2480000},
            "Accomplished Diesel": {"Manual": 2330000, "Automatic": 2530000},
            "Accomplished Plus Diesel": {"Manual": 2470000, "Automatic": 2670000},
            "Accomplished Plus A Diesel": {"Automatic": 2750000}
        }
    },
    "Mahindra": {
        "Scorpio N": {
            "Z2": {"Manual": 1350000, "Automatic": 1550000},
            "Z4": {"Manual": 1520000, "Automatic": 1720000},
            "Z6": {"Manual": 1720000, "Automatic": 1920000},
            "Z8": {"Manual": 1950000, "Automatic": 2150000},
            "Z8 L": {"Manual": 2180000, "Automatic": 2380000}
        },
        "XUV700": {
            "MX": {"Manual": 1480000, "Automatic": 1680000},
            "AX3": {"Manual": 1680000, "Automatic": 1880000},
            "AX5": {"Manual": 1880000, "Automatic": 2080000},
            "AX7": {"Manual": 2120000, "Automatic": 2320000},
            "AX7 L": {"Manual": 2380000, "Automatic": 2580000}
        },
        "Thar": {
            "AX Opt": {"Manual": 1150000, "Automatic": 1320000},
            "LX": {"Manual": 1320000, "Automatic": 1480000},
            "LX Hard Top": {"Manual": 1480000, "Automatic": 1650000}
        },
        "Bolero": {
            "B4": {"Manual": 950000},
            "B6": {"Manual": 1050000},
            "B6 Opt": {"Manual": 1150000}
        },
        "XUV 3XO": {
            "MX1": {"Manual": 780000, "Automatic": 880000},
            "MX2": {"Manual": 850000, "Automatic": 950000},
            "MX3": {"Manual": 920000, "Automatic": 1020000},
            "AX5": {"Manual": 1050000, "Automatic": 1150000},
            "AX7": {"Manual": 1180000, "Automatic": 1280000},
            "AX7 L": {"Manual": 1320000, "Automatic": 1420000}
        },
        "Scorpio Classic": {
            "S": {"Manual": 1150000},
            "S3": {"Manual": 1220000},
            "S5": {"Manual": 1290000},
            "S7": {"Manual": 1380000},
            "S9": {"Manual": 1470000},
            "S11": {"Manual": 1580000}
        }
    }
}

@api_router.get("/car-data/{brand}")
async def get_car_data(brand: str):
    if brand in CAR_DATA:
        return CAR_DATA[brand]
    return {}

# ============= ADMIN ROUTES =============

@api_router.get("/admin/locked-groups", response_model=List[Group])
async def get_locked_groups(admin_user: User = Depends(get_admin_user)):
    groups = await db.groups.find({"status": "locked"}, {"_id": 0}).to_list(1000)
    return [Group(**g) for g in groups]

@api_router.post("/admin/groups/{group_id}/offers", response_model=DealerOffer)
async def create_dealer_offer(group_id: str, offer_data: DealerOfferCreate, admin_user: User = Depends(get_admin_user)):
    # Check if group exists and is locked
    group = await db.groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    if group["status"] != "locked":
        raise HTTPException(status_code=400, detail="Can only add offers to locked groups")
    
    # Create offer
    offer = DealerOffer(
        group_id=group_id,
        **offer_data.model_dump()
    )
    await db.dealer_offers.insert_one(offer.model_dump())
    
    # Update group status to negotiation
    await db.groups.update_one(
        {"id": group_id},
        {"$set": {"status": "negotiation"}}
    )
    
    return offer

@api_router.get("/admin/groups/{group_id}/analytics")
async def get_group_analytics(group_id: str, admin_user: User = Depends(get_admin_user)):
    group = await db.groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    members_count = await db.group_members.count_documents({"group_id": group_id})
    offers = await db.dealer_offers.find({"group_id": group_id}, {"_id": 0}).to_list(1000)
    votes_count = await db.votes.count_documents({"group_id": group_id})
    
    return {
        "group": Group(**group),
        "members_count": members_count,
        "offers": [DealerOffer(**o) for o in offers],
        "total_votes": votes_count
    }

# ============= OFFER & VOTING ROUTES =============

@api_router.get("/groups/{group_id}/offers", response_model=List[DealerOffer])
async def get_group_offers(group_id: str):
    offers = await db.dealer_offers.find({"group_id": group_id}, {"_id": 0}).to_list(1000)
    return [DealerOffer(**o) for o in offers]

@api_router.post("/offers/{offer_id}/vote")
async def vote_for_offer(offer_id: str, current_user: User = Depends(get_current_user)):
    # Check if offer exists
    offer = await db.dealer_offers.find_one({"id": offer_id}, {"_id": 0})
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    
    group_id = offer["group_id"]
    
    # Check if user is a member of the group
    is_member = await db.group_members.find_one(
        {"group_id": group_id, "user_id": current_user.id},
        {"_id": 0}
    )
    if not is_member:
        raise HTTPException(status_code=403, detail="Must be a group member to vote")
    
    # Check if already voted in this group
    existing_vote = await db.votes.find_one(
        {"group_id": group_id, "user_id": current_user.id},
        {"_id": 0}
    )
    
    if existing_vote:
        # Remove vote from old offer
        old_offer_id = existing_vote["offer_id"]
        await db.dealer_offers.update_one(
            {"id": old_offer_id},
            {"$inc": {"votes": -1}}
        )
        # Delete old vote
        await db.votes.delete_one({"id": existing_vote["id"]})
    
    # Add new vote
    vote = Vote(
        user_id=current_user.id,
        offer_id=offer_id,
        group_id=group_id
    )
    await db.votes.insert_one(vote.model_dump())
    
    # Increment vote count on offer
    await db.dealer_offers.update_one(
        {"id": offer_id},
        {"$inc": {"votes": 1}}
    )
    
    return {"message": "Vote recorded successfully"}

# ============= SEED DATA =============

@api_router.post("/seed-data")
async def seed_initial_data():
    # Check if data already exists
    existing_groups = await db.groups.count_documents({})
    if existing_groups > 0:
        return {"message": "Data already seeded"}
    
    # Create sample groups - ONE group per car brand with brand logos
    sample_groups = [
        {
            "car_model": "Tata Motors",
            "brand": "Tata",
            "city": "All India",
            "image_url": "https://customer-assets.emergentagent.com/job_a5689270-22d8-4a27-847f-79733a2db487/artifacts/jig16627_tata.png",
            "max_members": 50,
            "current_members": 32
        },
        {
            "car_model": "Mahindra & Mahindra",
            "brand": "Mahindra",
            "city": "All India",
            "image_url": "https://customer-assets.emergentagent.com/job_a5689270-22d8-4a27-847f-79733a2db487/artifacts/y5bo7393_mahindra.png",
            "max_members": 50,
            "current_members": 41
        },
        {
            "car_model": "Kia Motors",
            "brand": "Kia",
            "city": "All India",
            "image_url": "https://customer-assets.emergentagent.com/job_a5689270-22d8-4a27-847f-79733a2db487/artifacts/ynyx5p8u_Kia.png",
            "max_members": 50,
            "current_members": 28
        },
        {
            "car_model": "Hyundai Motors",
            "brand": "Hyundai",
            "city": "All India",
            "image_url": "https://customer-assets.emergentagent.com/job_a5689270-22d8-4a27-847f-79733a2db487/artifacts/pl3kib9p_Hyundai.png",
            "max_members": 50,
            "current_members": 35
        },
        {
            "car_model": "Honda Cars",
            "brand": "Honda",
            "city": "All India",
            "image_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Honda_logo.svg/2560px-Honda_logo.svg.png",
            "max_members": 50,
            "current_members": 29
        },
        {
            "car_model": "Maruti Suzuki",
            "brand": "Maruti",
            "city": "All India",
            "image_url": "https://customer-assets.emergentagent.com/job_a5689270-22d8-4a27-847f-79733a2db487/artifacts/pc3414xi_Maruti%20Suzuki.jpg",
            "max_members": 50,
            "current_members": 44
        },
        {
            "car_model": "Volkswagen",
            "brand": "Volkswagen",
            "city": "All India",
            "image_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Volkswagen_logo_2019.svg/2560px-Volkswagen_logo_2019.svg.png",
            "max_members": 50,
            "current_members": 22
        },
        {
            "car_model": "Toyota",
            "brand": "Toyota",
            "city": "All India",
            "image_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/Toyota_carlogo.svg/2560px-Toyota_carlogo.svg.png",
            "max_members": 50,
            "current_members": 38
        }
    ]
    
    # Use upsert to prevent duplicates
    for group_data in sample_groups:
        group = Group(**group_data)
        # Update if exists, insert if not
        await db.groups.update_one(
            {"brand": group.brand},
            {"$set": group.model_dump()},
            upsert=True
        )
    
    return {"message": "Sample data seeded successfully"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()