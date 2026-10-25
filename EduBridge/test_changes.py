# -*- coding: utf-8 -*-
import sys
import json
import urllib.request
import urllib.parse

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from app import app
client = app.test_client()

def get(path):
    resp = client.get(path)
    return resp.get_json()

def post(path, payload):
    resp = client.post(path, data=json.dumps(payload), content_type='application/json')
    return resp.get_json()

print("==================================================")
print("1. TESTING /api/opportunities (Total count & filters)")
print("==================================================")
all_opps = get("/api/opportunities")
print(f"Total opportunities: {all_opps['count']}")
assert all_opps['count'] == 15, f"Expected 15 opportunities, got {all_opps['count']}"

# Test stream filters
for stream in ['commerce', 'arts', 'law', 'engineering', 'business']:
    res = get(f"/api/opportunities?stream={stream}")
    print(f"Stream '{stream}': {res['count']} opportunities found -> {[o['title'][:25] for o in res['opportunities']]}")
    assert res['count'] > 0, f"No opportunities for stream {stream}"

# Test sector filters
for sector in ['government', 'private', 'ngo']:
    res = get(f"/api/opportunities?sector={sector}")
    print(f"Sector '{sector}': {res['count']} opportunities found -> {[o['title'][:25] for o in res['opportunities']]}")
    assert res['count'] > 0, f"No opportunities for sector {sector}"

# Test mode filters
for mode in ['remote', 'hybrid', 'on-site']:
    res = get(f"/api/opportunities?mode={mode}")
    print(f"Mode '{mode}': {res['count']} opportunities found -> {[o['title'][:25] for o in res['opportunities']]}")
    assert res['count'] > 0, f"No opportunities for mode {mode}"

# Test role filters
for role in ['professional', 'entrepreneur', 'fresh-grad', 'undergrad']:
    res = get(f"/api/opportunities?role={role}")
    print(f"Role '{role}': {res['count']} opportunities found -> {[o['title'][:25] for o in res['opportunities']]}")
    assert res['count'] > 0, f"No opportunities for role {role}"

print("\n==================================================")
print("2. TESTING /api/ai/preset-questions")
print("==================================================")
presets = get("/api/ai/preset-questions")
print(f"Preset questions returned: {len(presets['presets'])}")
for p in presets['presets']:
    print(f" - [EN]: {p['en']}")
assert len(presets['presets']) >= 6

print("\n==================================================")
print("3. TESTING /api/engine/generate-plan (Different barriers & profiles)")
print("==================================================")
# Test 1: Non-technical student with confusing eligibility for RBI Internship
plan1 = post("/api/engine/generate-plan", {
    "opportunity_id": "rbi-summer-internship",
    "barrier_id": "confusing_eligibility",
    "student_profile": {"education": "undergrad", "stream": "commerce"}
})
print("Plan 1 (RBI + Confusing Eligibility):", plan1.get('plan_title'), "Criteria count:", len(plan1.get('criteria_checklist', [])))
assert "criteria_checklist" in plan1

# Test 2: Entrepreneur with unclear starting for Startup India Seed Fund
plan2 = post("/api/engine/generate-plan", {
    "opportunity_id": "startup-india-seed-fund",
    "barrier_id": "unclear_starting",
    "student_profile": {"education": "entrepreneur", "stream": "business"}
})
print("Plan 2 (Startup India + Unclear Starting):", plan2.get('plan_title'), "Tasks count:", len(plan2.get('action_tasks', [])))
assert "sop_starter_template" in plan2

# Test 3: Professional with limited time for Deloitte Upskilling
plan3 = post("/api/engine/generate-plan", {
    "opportunity_id": "deloitte-graduate-trainee",
    "barrier_id": "limited_time",
    "student_profile": {"education": "professional", "stream": "commerce"}
})
print("Plan 3 (Deloitte + Limited Time):", plan3.get('plan_title'), "Est minutes:", plan3.get('total_estimated_minutes'))
assert plan3.get('has_timer') == True

print("\n==================================================")
print("4. TESTING /api/ai/ask (English AI Responses)")
print("==================================================")
test_questions = [
    # Non-technical students
    ("Are non-technical students like B.Com, BA, LLB eligible?", None),
    # Government vs Private
    ("What are the government vs private opportunities?", None),
    # Working professionals
    ("Can working professionals or fresh graduates apply?", None),
    # Aspiring entrepreneurs
    ("Are there grants for aspiring entrepreneurs and startups?", None),
    # Specific opportunity questions
    ("Can commerce students apply for the RBI Internship?", "rbi-summer-internship"),
    ("Who is eligible for the Startup India Seed Fund?", "startup-india-seed-fund")
]

for q, opp_id in test_questions:
    payload = {"question": q}
    if opp_id:
        payload["opportunity_id"] = opp_id
    res = post("/api/ai/ask", payload)
    answer = res.get('answer', '')
    print(f"\n[Q]: {q}")
    print(f"[A ({res.get('source')})]: {answer[:180]}...")
    assert len(answer) > 20, "Answer too short!"
    assert 'answer_te' not in res, "Should not return answer_te"
    assert 'answer_hi' not in res, "Should not return answer_hi"

print("\n==================================================")
print("ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!")
print("==================================================")
