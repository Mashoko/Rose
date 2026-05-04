#!/usr/bin/env python3
"""Test MongoDB connection and Flask API endpoints."""

import sys
import json
from pathlib import Path
import requests

# Add fingerprint_module to path
_ROOT = Path(__file__).resolve().parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

# Test 1: Direct MongoDB Connection
print("=" * 60)
print("TEST 1: MongoDB Connection")
print("=" * 60)
try:
    from pymongo import MongoClient
    client = MongoClient("mongodb://localhost:27017", serverSelectionTimeoutMS=3000)
    client.admin.command('ping')
    print("✓ MongoDB is running and accessible")
    
    # Check the database
    db = client['test']
    employees = db['employees']
    count = employees.count_documents({})
    print(f"✓ 'test' database has {count} employees total")
    
    # Check enrolled fingerprints
    enrolled = employees.count_documents({"fingerprintId": {"$exists": True, "$ne": None}})
    print(f"✓ {enrolled} employees with enrolled fingerprints")
    
    # List them
    if enrolled > 0:
        print("\nEnrolled employees:")
        for emp in employees.find({"fingerprintId": {"$exists": True, "$ne": None}}):
            print(f"  - {emp.get('fullName', 'Unknown')}: fingerprint_id={emp.get('fingerprintId')}")
    
except Exception as e:
    print(f"✗ MongoDB Connection Failed: {e}")
    print("\n  FIX: Start MongoDB with: 'mongod' in a separate terminal")

# Test 2: Flask API Health
print("\n" + "=" * 60)
print("TEST 2: Flask API Health Check")
print("=" * 60)
try:
    r = requests.get("http://localhost:5001/health", timeout=5)
    if r.status_code == 200:
        print("✓ Flask API is running and responding")
        print(f"  Response: {r.json()}")
    else:
        print(f"✗ Flask API returned {r.status_code}")
except Exception as e:
    print(f"✗ Flask API is not reachable: {e}")
    print("\n  FIX: Start Flask API with: 'python run_fingerprint_api.py' from fingerprint_module folder")

# Test 3: Check /enrolled endpoint
print("\n" + "=" * 60)
print("TEST 3: /enrolled Endpoint")
print("=" * 60)
try:
    r = requests.get("http://localhost:5001/enrolled", timeout=5)
    if r.status_code == 200:
        data = r.json()
        users = data.get('users', [])
        print(f"✓ /enrolled endpoint returned {len(users)} enrolled members")
        if users:
            print("\nEnrolled members from API:")
            for user in users:
                print(f"  - {user.get('fullName', 'Unknown')}: FP#{user.get('fingerprintId')}")
        else:
            print("  ⚠ No enrolled members found in API response")
    else:
        print(f"✗ /enrolled returned {r.status_code}: {r.text}")
except Exception as e:
    print(f"✗ Error calling /enrolled: {e}")

# Test 4: Test registration endpoint
print("\n" + "=" * 60)
print("TEST 4: Registration Endpoint (Mock Test)")
print("=" * 60)
test_user = {
    "name": "Test User",
    "email": "test@example.com",
    "fingerprint_id": 999
}
try:
    r = requests.post(
        "http://localhost:5001/register_user",
        json=test_user,
        timeout=5
    )
    if r.status_code == 201:
        print("✓ Registration successful")
        print(f"  Response: {r.json()}")
    else:
        print(f"✗ Registration failed with {r.status_code}")
        print(f"  Response: {r.text}")
except Exception as e:
    print(f"✗ Error testing registration: {e}")

print("\n" + "=" * 60)
print("SUMMARY")
print("=" * 60)
print("If MongoDB is running and Flask API is responding,")
print("try clicking 'Refresh' in your fingerprint dashboard.")
print("=" * 60)
