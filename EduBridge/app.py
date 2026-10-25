"""
EduBridge AI — Discover Opportunities. Remove Barriers. Take Action.
Flask Web Server & Barrier-to-Action Engine REST API.
"""

import os
import sys
import json
import datetime

# Ensure safe UTF-8 output on Windows consoles
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

from flask import Flask, render_template, request, jsonify, send_file
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)

# Load data files
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')

def load_json_file(filename):
    filepath = os.path.join(DATA_DIR, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

OPPORTUNITIES = load_json_file('opportunities.json')
BARRIERS_DATA = load_json_file('barriers_rules.json')
BARRIERS = BARRIERS_DATA.get('barriers', [])
COMMON_GUIDANCE = BARRIERS_DATA.get('common_guidance', {})

# Gemini AI Client Setup
_cached_gemini_key = None
_cached_gemini_client = None

def get_gemini_client():
    """
    Returns an initialized Gemini client if GEMINI_API_KEY is configured in the environment.
    If not configured or is a placeholder, returns None (enabling seamless offline fallback).
    Never raises an exception; automatically handles server environment variable keys.
    """
    global _cached_gemini_key, _cached_gemini_client
    raw_key = os.getenv("GEMINI_API_KEY", "").strip().strip('"').strip("'")
    is_valid = bool(
        raw_key
        and not raw_key.startswith("your_")
        and raw_key != "YOUR_GEMINI_API_KEY"
    )

    if not is_valid:
        _cached_gemini_key = None
        _cached_gemini_client = None
        return None

    if _cached_gemini_client is not None and _cached_gemini_key == raw_key:
        return _cached_gemini_client

    try:
        from google import genai
        _cached_gemini_client = genai.Client(api_key=raw_key)
        _cached_gemini_key = raw_key
        print("[EduBridge AI] Gemini API client initialized successfully from environment variable.")
        return _cached_gemini_client
    except Exception as e:
        print(f"[EduBridge AI] Note: Gemini client init error ({e}). Using verified smart rule-based engine.")
        _cached_gemini_key = None
        _cached_gemini_client = None
        return None

# Log startup mode
if get_gemini_client():
    print("[EduBridge AI] Server initialized with Live Gemini AI active.")
else:
    print("[EduBridge AI] Server initialized in verified offline rule-based mode (No API key required).")


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/health')
def health():
    client = get_gemini_client()
    return jsonify({
        "status": "healthy",
        "app_name": "EduBridge AI",
        "version": "1.0.0",
        "mode": "live-gemini" if client else "verified-offline-rule-based",
        "gemini_active": bool(client),
        "total_opportunities": len(OPPORTUNITIES),
        "total_barriers": len(BARRIERS),
        "timestamp": datetime.datetime.now().isoformat()
    })


@app.route('/api/opportunities', methods=['GET'])
def get_opportunities():
    category = request.args.get('category', '').strip().lower()
    level = request.args.get('level', '').strip().lower()
    interest = request.args.get('interest', '').strip().lower()
    search = request.args.get('q', '').strip().lower()
    sector = request.args.get('sector', '').strip().lower()
    mode = request.args.get('mode', '').strip().lower()
    stream = request.args.get('stream', '').strip().lower()

    filtered = OPPORTUNITIES

    if category and category != 'all':
        filtered = [o for o in filtered if category in o['category'].lower()]

    if sector and sector != 'all':
        filtered = [o for o in filtered if sector in o.get('sector', '').lower()]

    if mode and mode != 'all':
        filtered = [o for o in filtered if mode in o.get('mode', '').lower()]

    if stream and stream != 'all':
        filtered = [
            o for o in filtered
            if 'all' in [s.lower() for s in o.get('target_streams', [])]
            or 'any' in [s.lower() for s in o.get('target_streams', [])]
            or stream in [s.lower() for s in o.get('target_streams', [])]
        ]

    if level and level != 'all':
        filtered = [
            o for o in filtered
            if level in [lvl.lower() for lvl in o.get('target_levels', [])]
            or level in [r.lower() for r in o.get('target_roles', [])]
            or 'all' in [lvl.lower() for lvl in o.get('target_levels', [])]
        ]

    if interest and interest != 'all':
        filtered = [o for o in filtered if interest in [it.lower() for it in o.get('target_interests', [])]]

    if search:
        filtered = [
            o for o in filtered
            if search in o['title'].lower()
            or search in o['summary'].lower()
            or search in o['provider'].lower()
            or search in o['category'].lower()
            or search in o.get('sector', '').lower()
            or search in o.get('mode', '').lower()
            or search in " ".join(o.get('target_streams', [])).lower()
        ]

    return jsonify({
        "count": len(filtered),
        "opportunities": filtered
    })


@app.route('/api/opportunities/<opp_id>', methods=['GET'])
def get_opportunity(opp_id):
    opp = next((o for o in OPPORTUNITIES if o['id'] == opp_id), None)
    if not opp:
        return jsonify({"error": "Opportunity not found"}), 404
    return jsonify(opp)


@app.route('/api/barriers', methods=['GET'])
def get_barriers():
    return jsonify({
        "barriers": BARRIERS,
        "guidance": COMMON_GUIDANCE
    })


@app.route('/api/engine/generate-plan', methods=['POST'])
def generate_plan():
    """
    Main Innovation: Barrier-to-Action Engine.
    Generates a personalized, highly specific action plan based on the student's selected barrier.
    """
    data = request.get_json() or {}
    opp_id = data.get('opportunity_id')
    barrier_id = data.get('barrier_id')
    student_profile = data.get('student_profile', {})

    opp = next((o for o in OPPORTUNITIES if o['id'] == opp_id), None)
    if not opp:
        return jsonify({"error": "Opportunity not found"}), 404

    barrier = next((b for b in BARRIERS if b['id'] == barrier_id), None)
    if not barrier:
        return jsonify({"error": "Invalid barrier selected"}), 400

    plan = build_barrier_action_plan(opp, barrier, student_profile)
    return jsonify(plan)


def build_barrier_action_plan(opp, barrier, profile):
    """Core logic of the Barrier-to-Action Engine"""
    barrier_id = barrier['id']
    opp_title = opp['title']
    days_left = opp.get('days_left', 30)

    base_plan = {
        "opportunity_id": opp['id'],
        "opportunity_title": opp_title,
        "barrier_id": barrier_id,
        "barrier_title": barrier['title'],
        "barrier_icon": barrier['icon'],
        "action_type": barrier['action_type'],
        "created_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "official_source": opp.get('verified_source', ''),
        "official_url": opp.get('official_url', '#'),
        "trust_notice": COMMON_GUIDANCE.get('trust_notice', '')
    }

    # 1. Confusing Eligibility
    if barrier_id == "confusing_eligibility":
        criteria_tasks = []
        for i, c in enumerate(opp.get('eligibility_criteria', [])):
            criteria_tasks.append({
                "id": f"crit_{i+1}",
                "criterion_id": c['id'],
                "title": f"Condition {i+1}: {c['text']}",
                "simple_en": c['simple_en'],
                "type": "criteria_check",
                "default_state": "unsure"  # 'met', 'not_met', 'unsure'
            })

        extra_tasks = [
            {
                "id": "crit_verify_nodal",
                "title": "Speak to College Scholarship/Nodal Officer",
                "desc": "Take a printout or screenshot of this opportunity to your academic administrative office to verify your college's affiliation status.",
                "time_mins": 15,
                "completed": False
            },
            {
                "id": "crit_income_calc",
                "title": "Calculate Family Annual Gross Income",
                "desc": "Ensure your parents' combined annual earnings from salary, business, or agriculture fit within the ceiling.",
                "time_mins": 10,
                "completed": False
            }
        ]

        base_plan.update({
            "plan_title": "Eligibility Clarity & Verification Roadmap",
            "plan_headline": f"Verify eligibility criteria line-by-line for {opp_title}",
            "summary": "Break down confusing eligibility rules into clear yes/no questions. Verify each condition without guessing.",
            "criteria_checklist": criteria_tasks,
            "action_tasks": extra_tasks,
            "verdict_options": {
                "all_met": "🎉 You appear fully eligible based on standard criteria! Proceed with confidence.",
                "unsure": "⚠️ You have 1 or more unsure items. Use the steps below or ask our AI advisor before dismissing this opportunity.",
                "not_met": "ℹ️ One or more strict criteria are not met. Check for waiver provisions or explore alternative matching opportunities."
            }
        })

    # 2. Missing Documents
    elif barrier_id == "missing_documents":
        doc_tasks = []
        for i, d in enumerate(opp.get('required_documents', [])):
            doc_tasks.append({
                "id": f"doc_{i+1}",
                "doc_id": d['id'],
                "title": d['name'],
                "issuer": d['issuer'],
                "format": d['format'],
                "tips": d['tips'],
                "urgent": d.get('urgent', False),
                "status": "pending",  # 'pending', 'requested', 'ready'
                "completed": False
            })

        extra_tasks = [
            {
                "id": "doc_digilocker",
                "title": "Pull digital certificates from DigiLocker (Free & Instant)",
                "desc": "Class 10/12 marksheets, CBSE pass certificates, and many state income certificates can be downloaded instantly via DigiLocker with Aadhaar OTP.",
                "time_mins": 10,
                "completed": False
            },
            {
                "id": "doc_scan_compress",
                "title": "Scan and compress files to PDF under 2MB",
                "desc": "Take clear photos in daylight using your phone, then export as clean PDF. Ensure text is crisp and readable.",
                "time_mins": 15,
                "completed": False
            },
            {
                "id": "doc_organized_folder",
                "title": "Create a dedicated folder on phone/cloud",
                "desc": f"Create a folder named '{opp['id']}-docs' and place all renamed files (e.g. 'Marksheet_12th.pdf') together.",
                "time_mins": 5,
                "completed": False
            }
        ]

        base_plan.update({
            "plan_title": "Document Prep & Verification Pipeline",
            "plan_headline": f"Get every document ready before you apply to {opp_title}",
            "summary": "Never get disqualified by missing paperwork. Here is the exact list of required certificates, where to get them, and free shortcuts like DigiLocker.",
            "documents_checklist": doc_tasks,
            "action_tasks": extra_tasks,
            "free_tools": [
                {"name": "DigiLocker Govt Portal", "url": "https://www.digilocker.gov.in", "purpose": "Instant verified marksheets"},
                {"name": "Free PDF Compress Tool", "url": "https://www.ilovepdf.com/compress_pdf", "purpose": "Reduce file size below 2MB"}
            ]
        })

    # 3. Late Discovery
    elif barrier_id == "late_discovery":
        fast_tasks = [
            {
                "id": "late_task_1",
                "title": "Lock in your Application Registration immediately",
                "desc": "Go to the portal now and create your basic account with email/mobile. This generates an Application ID and locks your entry before server rush.",
                "urgency": "High",
                "time_mins": 8,
                "completed": False
            },
            {
                "id": "late_task_2",
                "title": "Submit Minimum Viable Documents (Use provisional/DigiLocker)",
                "desc": "If physical original certificates aren't available, upload DigiLocker copies or internet marksheets with college seal stamp.",
                "urgency": "High",
                "time_mins": 15,
                "completed": False
            },
            {
                "id": "late_task_3",
                "title": "Draft short answers offline in simple words",
                "desc": "Don't overthink essay questions. Keep answers clear, honest, and direct (100–150 words).",
                "urgency": "Medium",
                "time_mins": 20,
                "completed": False
            },
            {
                "id": "late_task_4",
                "title": "Submit at least 6 hours before official closing time",
                "desc": "Government and scholarship portals often experience server slowdowns or gateway timeouts in the final hours. Avoid midnight rush.",
                "urgency": "High",
                "time_mins": 10,
                "completed": False
            },
            {
                "id": "late_task_5",
                "title": "Add calendar reminder for next cycle / similar opportunities",
                "desc": "Even if this cycle is tight, set an alert for the next opening so you're first in line next year.",
                "urgency": "Normal",
                "time_mins": 2,
                "completed": False
            }
        ]

        base_plan.update({
            "plan_title": "Fast-Track Submission Triage Plan",
            "plan_headline": f"Urgent Sprint: {days_left} Days Remaining for {opp_title}",
            "summary": "Short on time? Focus exclusively on high-priority tasks to make a valid submission before the cutoff.",
            "action_tasks": fast_tasks,
            "deadline_alert": {
                "days_left": days_left,
                "deadline_date": opp.get('deadline_display', ''),
                "urgency_level": "High Urgency" if days_left <= 10 else "Moderate Urgency"
            }
        })

    # 4. Limited Internet or Device Access
    elif barrier_id == "limited_internet":
        offline_tasks = [
            {
                "id": "net_task_1",
                "title": "Download the Offline Printable Text Guide (.txt)",
                "desc": "Save this full opportunity guide to your device storage or print it out. You can read everything without using mobile data.",
                "time_mins": 2,
                "completed": False
            },
            {
                "id": "net_task_2",
                "title": "Handwrite answers and SOP on paper first",
                "desc": "Write out your statement of purpose, project idea, or reasons for applying on paper. Polish it at your own pace at home.",
                "time_mins": 25,
                "completed": False
            },
            {
                "id": "net_task_3",
                "title": "Pre-load all documents onto a USB pen drive or phone folder",
                "desc": "Gather marksheet, photo, and ID in a single folder. Name each file clearly (e.g. 'Photo.jpg', 'Marksheet.pdf').",
                "time_mins": 10,
                "completed": False
            },
            {
                "id": "net_task_4",
                "title": "Execute 15-Minute Cyber-Café / College Computer Lab Session",
                "desc": "Visit a cyber-café or college lab with your USB. Since all files and texts are ready, simply log in, copy-paste answers, upload, submit, and print the confirmation page. Total cost/time: Under ₹15 and 15 minutes!",
                "time_mins": 15,
                "completed": False
            }
        ]

        # Generate printable text payload
        printable_text = f"""================================================================================
EDUBRIDGE AI — OFFLINE APPLICATION CHECKLIST & ACTION PACK
Opportunity: {opp_title}
Provider: {opp.get('provider', '')}
Category: {opp.get('category', '')}
Deadline: {opp.get('deadline_display', '')}
Official Portal: {opp.get('official_url', '')}
================================================================================

SUMMARY:
{opp.get('summary', '')}

KEY BENEFIT / AWARD:
{opp.get('award_summary', '')}

--------------------------------------------------------------------------------
ELIGIBILITY CHECKLIST (Tick on paper):
--------------------------------------------------------------------------------
"""
        for i, c in enumerate(opp.get('eligibility_criteria', [])):
            printable_text += f"[ ] Condition {i+1}: {c['text']}\n    Simple: {c['simple_en']}\n\n"

        printable_text += """--------------------------------------------------------------------------------
REQUIRED DOCUMENTS (Collect before visiting Cyber-Cafe / Lab):
--------------------------------------------------------------------------------
"""
        for i, d in enumerate(opp.get('required_documents', [])):
            printable_text += f"[ ] {d['name']}\n    Issuing Office: {d['issuer']}\n    Format: {d['format']}\n    Tip: {d['tips']}\n\n"

        printable_text += """--------------------------------------------------------------------------------
CYBER-CAFE / COLLEGE LAB 15-MINUTE BATTLE PLAN:
--------------------------------------------------------------------------------
1. At Home (Offline): Write all answers on paper or phone notes.
2. Put all scanned PDFs/photos onto a USB drive or phone storage.
3. At Cyber-Cafe: Open the portal link above.
4. Copy-paste answers, upload files, submit, and save confirmation PDF.
5. You are done in under 15 minutes!

Notice: EduBridge AI is an educational guidance tool. We do not charge fees or guarantee selection.
================================================================================
"""

        base_plan.update({
            "plan_title": "Low-Bandwidth & Offline Battle Plan",
            "plan_headline": f"Prepare 100% offline for {opp_title}. Submit in 15 mins at Lab/Cafe.",
            "summary": "Don't let spotty internet or lack of a personal laptop stop you. Prepare all paperwork and text offline at home, then upload in one quick low-cost cyber-café or college lab session.",
            "action_tasks": offline_tasks,
            "offline_text": printable_text,
            "enable_offline_download": True
        })

    # 5. Unclear Starting Steps
    elif barrier_id == "unclear_starting":
        sop_template = f"""Statement of Interest / Application Draft:
My name is [Your Name], and I am currently in my [Year of Study, e.g., 1st year B.Tech / Degree] at [College Name].
I am applying for {opp_title} because [Explain your key passion: e.g. I want to build technology that impacts local communities / I require financial support to continue higher education].
This opportunity will allow me to [Mention 1 goal: e.g. afford essential textbooks / gain hands-on open-source mentorship / develop my solar energy project].
I have consistently demonstrated dedication through [Mention 1 project, club activity, or academic achievement].
Thank you for considering my application."""

        starter_tasks = [
            {
                "id": "start_phase_1",
                "phase": "Phase 1: Zero-Pressure Warmup (10 mins)",
                "title": "Create an account on the official portal",
                "desc": f"Click through to {opp.get('official_url', 'the portal')}. Register with your student email and phone number. Don't fill any long answers yet—just verify your email and bookmark the application page.",
                "time_mins": 10,
                "completed": False
            },
            {
                "id": "start_phase_2",
                "phase": "Phase 2: Fill-in-the-Blanks Draft (20 mins)",
                "title": "Use our built-in Statement Starter template",
                "desc": "Copy the draft template provided below. Replace the bracketed placeholders with your own information. You now have a solid draft without staring at a blank screen!",
                "time_mins": 20,
                "completed": False
            },
            {
                "id": "start_phase_3",
                "phase": "Phase 3: The Polish & Launch (15 mins)",
                "title": "Quick review and final submission",
                "desc": "Paste your answers into the portal form, upload the required marksheets, review the preview page, and click Submit. Celebrate taking action!",
                "time_mins": 15,
                "completed": False
            }
        ]

        base_plan.update({
            "plan_title": "Zero-Pressure 3-Phase Application Roadmap",
            "plan_headline": f"Conquer the blank page: 3 simple phases for {opp_title}",
            "summary": "Large application portals feel intimidating when tackled all at once. We break it into 3 bite-sized phases with ready-to-customize drafts.",
            "action_tasks": starter_tasks,
            "sop_starter_template": sop_template
        })

    # 6. Limited Time
    elif barrier_id == "limited_time":
        time_tasks = [
            {
                "id": "sprint_1",
                "sprint_num": 1,
                "title": "Sprint 1 (10 mins): Gather existing digital marksheets",
                "desc": "Search your phone gallery, email, or DigiLocker for your 10th/12th marksheets and student ID. Save them into one folder.",
                "time_mins": 10,
                "completed": False
            },
            {
                "id": "sprint_2",
                "sprint_num": 2,
                "title": "Sprint 2 (15 mins): Basic Profile & Education info",
                "desc": "Log into the portal and complete Section 1 (Personal details, address, college name, GPA). Easy fields that require no essays.",
                "time_mins": 15,
                "completed": False
            },
            {
                "id": "sprint_3",
                "sprint_num": 3,
                "title": "Sprint 3 (15 mins): Upload files & Statement",
                "desc": "Upload the saved documents. Write 3 short paragraphs explaining your interest and goals.",
                "time_mins": 15,
                "completed": False
            },
            {
                "id": "sprint_4",
                "sprint_num": 4,
                "title": "Sprint 4 (5 mins): Final Check & Submit",
                "desc": "Review the summary screen to ensure no typos in bank/contact info, then hit Submit and save your receipt.",
                "time_mins": 5,
                "completed": False
            }
        ]

        base_plan.update({
            "plan_title": "Time-Boxed Micro-Sprints (45 Mins Total)",
            "plan_headline": f"Four 10-15 minute micro-sprints for {opp_title}",
            "summary": "Busy with semester exams, laboratory submissions, or family responsibilities? Complete this entire application in 4 micro-sprints over 2 or 3 days.",
            "action_tasks": time_tasks,
            "total_estimated_minutes": 45,
            "has_timer": True
        })

    return base_plan


@app.route('/api/ai/preset-questions', methods=['GET'])
def get_preset_questions():
    presets = [
        {"id": "p1", "en": "Are non-technical students (B.Com, BA, LLB) eligible?"},
        {"id": "p2", "en": "What are the government vs private opportunities?"},
        {"id": "p3", "en": "Can working professionals and career changers apply?"},
        {"id": "p4", "en": "Are there grants for aspiring entrepreneurs and startups?"},
        {"id": "p5", "en": "Which internships offer paid stipends and remote mode?"},
        {"id": "p6", "en": "What are the exact required documents and proof needed?"}
    ]
    return jsonify({"presets": presets})


@app.route('/api/ai/ask', methods=['POST'])
def ai_ask():
    """
    AI Assistant Endpoint (English Only):
    Provides clear, jargon-free explanations of opportunity requirements in English.
    Uses Google Gemini API if configured; otherwise provides instant, accurate rule-based answers.
    Adheres strictly to Trust & Safety: never promises selection, never asks for sensitive data.
    """
    data = request.get_json() or {}
    opp_id = data.get('opportunity_id')
    question = data.get('question', '').strip()

    if not question:
        return jsonify({"error": "Question is required"}), 400

    opp = next((o for o in OPPORTUNITIES if o['id'] == opp_id), None)

    # Trust & Safety check
    sensitive_keywords = ['aadhaar', 'bank account', 'otp', 'password', 'atm', 'credit card', 'cvv']
    if any(k in question.lower() for k in sensitive_keywords):
        return jsonify({
            "answer": "🛡️ Safety Notice: EduBridge AI never asks for or processes sensitive credentials such as Aadhaar numbers, bank account details, OTPs, or passwords. Please only enter such information directly on the official verified government/organization portal.",
            "source": "trust-safety-guardrail",
            "disclaimer": "EduBridge AI does not guarantee eligibility or funding."
        })

    # Try Live Gemini if API key is configured in environment
    client = get_gemini_client()
    if client:
        try:
            context_str = ""
            if opp:
                context_str = f"""
Context on Selected Opportunity:
Title: {opp['title']}
Provider: {opp['provider']}
Category: {opp['category']}
Sector: {opp.get('sector', 'N/A')}
Mode: {opp.get('mode', 'N/A')}
Deadline: {opp['deadline_display']}
Award/Benefit: {opp['award_summary']}
Target Streams: {json.dumps(opp.get('target_streams', []))}
Target Roles: {json.dumps(opp.get('target_roles', []))}
Eligibility Criteria: {json.dumps(opp['eligibility_criteria'])}
Required Documents: {json.dumps(opp['required_documents'])}
Official Source: {opp['verified_source']} ({opp['official_url']})
"""
            else:
                context_str = f"""
Database Overview:
EduBridge AI catalog serves students across all 28 Indian States & 8 UTs covering Government and Private opportunities across:
- Non-technical & technical students (BA, B.Com, B.Sc, LLB, B.Tech, BCA, MCA)
- Working professionals & fresh graduates (Teach For India, NITI Aayog, Deloitte, GSoC, SWAYAM)
- Aspiring entrepreneurs (Startup India Seed Fund Scheme up to ₹20 Lakhs, UNDP Youth Co:Lab)
- Government options (NITI Aayog, RBI, NMMSS, SWAYAM, SIH, ISRO)
- Private/Corporate & NGO options (Reliance Foundation, Deloitte, HDFC Parivartan, Teach For India, Tata Trusts, Google, Microsoft)
"""
            prompt = f"""
You are EduBridge AI, a helpful, transparent student, professional, and entrepreneur opportunity advisor supporting learners across India.
{context_str}

Student's Question: {question}

Rules:
1. Explain simply and clearly in English for students, professionals, or entrepreneurs from any educational background.
2. NEVER guarantee eligibility, selection, or funding. State clearly that criteria must be confirmed on official portal.
3. Support all disciplines (Arts, Commerce, Law, Tech, Sciences) and both Government and Private sectors without technical bias.
4. Keep the answer under 130 words and encourage constructive action.
"""
            response = client.models.generate_content(
                model="gemini-3.8-flash",
                contents=prompt
            )
            return jsonify({
                "answer": response.text,
                "source": "gemini-3.8-flash",
                "disclaimer": "AI Guidance only. Confirm with official portal before submission."
            })
        except Exception as e:
            print(f"[EduBridge AI] Gemini call exception: {e}. Falling back to rule-based engine.")

    # Rule-Based Fallback Engine (Fast, 100% Reliable, English Only)
    rule_result = resolve_question_rule_based(question, opp)
    return jsonify(rule_result)


def resolve_question_rule_based(question, opp):
    q_lower = question.lower()

    # 1. Non-Technical Students (Arts, Commerce, Law, Humanities)
    if any(k in q_lower for k in ['b.com', 'b.a', 'arts', 'commerce', 'humanities', 'llb', 'law', 'non-tech']):
        ans = "Yes! EduBridge AI features dedicated Government and Private tracks for non-technical students across India:\n• Government Internships: NITI Aayog (open to Law, Economics, Sociology, Arts) & RBI Summer Internship (Economics, Commerce, Banking, Law).\n• Private Scholarships: Reliance Foundation UG/PG (open to all degrees) & HDFC Parivartan ECSS (dedicated B.Com, BA, B.Sc quota).\n• Corporate & NGO: Deloitte Strategy Internship (B.Com, BBA, BA Economics) & Teach For India Fellowship (any graduate).\n• Free Certifications: SWAYAM national courses in Accounting, History, and Constitutional Law."
        return {
            "answer": ans,
            "source": "verified-knowledge-base",
            "disclaimer": "AI Guidance only. Confirm with official portal."
        }

    # 2. Working Professionals & Fresh Graduates / Career Changers
    if any(k in q_lower for k in ['professional', 'career changer', 'fresh grad', 'job', 'career change']):
        ans = "Working professionals, fresh graduates, and career changers have several high-impact options:\n• Teach For India Fellowship: 2-year leadership journey with ₹23,040/mo salary + HRA, welcoming career changers into policy, management, and CSR.\n• NITI Aayog Internship: Open to graduates and professionals researching national policy verticals.\n• Google Summer of Code (GSoC): Open to verified tech beginners and career changers ($1,500 - $3,000 stipend).\n• Startup India Seed Fund: Open to working professionals launching their own ventures with up to ₹20 Lakhs in seed grants.\n• SWAYAM Online Certifications: Free upskilling in management, data, and law for working professionals."
        return {
            "answer": ans,
            "source": "verified-knowledge-base",
            "disclaimer": "AI Guidance only. Confirm with official portal."
        }

    # 3. Aspiring Entrepreneurs & Startup Grants
    if any(k in q_lower for k in ['entrepreneur', 'startup', 'seed fund', 'founder', 'venture']):
        ans = "Aspiring entrepreneurs and early-stage founders can access non-dilutive government and private funding:\n• Startup India Seed Fund Scheme (SISFS): Govt DPIIT grant up to ₹20 Lakhs for prototype validation and up to ₹50 Lakhs for market entry across all sectors (agro, retail, tech, health, green energy).\n• UNDP & Youth Co:Lab Innovation Challenge: $5,00,00 equity-free seed grant + 6 months UN incubation for youth solving social and environmental problems.\n• SIH Incubation Support: Winning hackathon problem statements qualify for government-backed technology business incubators."
        return {
            "answer": ans,
            "source": "verified-knowledge-base",
            "disclaimer": "AI Guidance only. Confirm with official portal."
        }

    # 4. Government vs Private Opportunities
    if any(k in q_lower for k in ['govt', 'government', 'private', 'sector']):
        ans = "EduBridge AI aggregates both sectors with transparent official source tracking across India:\n• Government Opportunities: Central Sector NMMSS DBT scholarship, NITI Aayog policy internship, Reserve Bank of India (RBI) stipend internship, SWAYAM national certifications, Startup India Seed Fund, Smart India Hackathon, and ISRO IIRS.\n• Private & NGO Opportunities: Reliance Foundation UG/PG grants, Deloitte Corporate Trainee Track, HDFC Bank Parivartan CSR scholarships, Teach For India 2-year leadership fellowship, Tata Trusts Higher Education Grants, Google Summer of Code, and UNDP Youth Co:Lab."
        return {
            "answer": ans,
            "source": "verified-knowledge-base",
            "disclaimer": "AI Guidance only. Confirm with official portal."
        }

    # 5. Remote and Paid Internships
    if any(k in q_lower for k in ['remote', 'stipend', 'paid']):
        ans = "Here are top paid and remote options available:\n• Google Summer of Code (GSoC): 100% Global Remote with $1,500 – $3,000 USD paid stipend.\n• Reserve Bank of India (RBI): Paid on-site internship with ₹20,000/month stipend.\n• Deloitte Graduate Trainee: Hybrid paid internship offering ₹25,000 – ₹35,000/month + full-time job offer.\n• Teach For India: Paid fellowship offering ₹23,040/month + housing allowance.\n• Microsoft Learn Student Ambassadors: 100% Remote with $150/month Azure credits & LinkedIn Learning."
        return {
            "answer": ans,
            "source": "verified-knowledge-base",
            "disclaimer": "AI Guidance only. Confirm with official portal."
        }

    # If no opportunity selected and no specific topic matched
    if not opp:
        return {
            "answer": "EduBridge AI covers Government and Private scholarships, internships, fellowships, jobs, courses, and startup grants across Technical (B.Tech, BCA), Non-Technical (BA, B.Com, B.Sc, LLB), Professional, and Entrepreneur tracks. Select an opportunity from the Explorer or ask any specific question!",
            "source": "rule-engine"
        }

    # 6. Specific opportunity streams & degrees question
    if any(k in q_lower for k in ['degree', 'branch', 'stream', 'who can apply', 'eligible']):
        streams = ", ".join(opp.get('target_streams', ['all']))
        roles = ", ".join(opp.get('target_roles', ['student']))
        levels = ", ".join(opp.get('target_levels', ['all']))
        ans = f"Eligibility for {opp['title']}:\n• Target Streams: {streams.title()}\n• Target Roles: {roles.title()}\n• Target Levels: {levels.title()}\n• Mode: {opp.get('mode', 'Online')}\nCheck the Criteria Checklist in the Barrier Engine above to verify your specific match!"
        return {
            "answer": ans,
            "source": "verified-knowledge-base",
            "disclaimer": "AI Guidance only. Confirm with official portal."
        }

    # 7. Specific opportunity income limit question
    if any(k in q_lower for k in ['income', 'salary', 'lakh']):
        income_crit = next((c for c in opp.get('eligibility_criteria', []) if 'income' in c['text'].lower()), None)
        if income_crit:
            ans = f"Income Requirement: {income_crit['simple_en']} Be sure to have an updated Tahsildar / Revenue / e-District Income Certificate or Form 16."
        else:
            ans = f"There is no strict household income ceiling specified for {opp['title']}. Selection is based primarily on merit, proposal quality, or project application."
        return {
            "answer": ans,
            "source": "verified-knowledge-base",
            "disclaimer": "AI Guidance only. Confirm with official portal."
        }

    # 8. Documents needed question
    if any(k in q_lower for k in ['document', 'certificate', 'paper']):
        docs = opp.get('required_documents', [])
        doc_list = "; ".join([f"{d['name']} ({d['issuer']})" for d in docs])
        ans = f"Required documents for {opp['title']}: {doc_list}. Tip: Check DigiLocker or your state's online citizen portal for instant digital marksheets!"
        return {
            "answer": ans,
            "source": "verified-knowledge-base",
            "disclaimer": "AI Guidance only. Confirm with official portal."
        }

    # 9. Bonafide certificate question
    if any(k in q_lower for k in ['bonafide', 'college']):
        ans = "To get a College Bonafide Certificate: Visit your college administrative / examination office with your ID card and fee receipt. Request the clerk for a 'Bonafide Certificate for Scholarship/Internship Application'. It usually takes 1 to 2 business days and carries the Principal's stamp."
        return {
            "answer": ans,
            "source": "verified-knowledge-base",
            "disclaimer": "AI Guidance only. Confirm with official portal."
        }

    # 10. General matching fallback
    return {
        "answer": f"Here is what you need to know about {opp['title']}: {opp['summary']} The award/stipend is {opp['award_summary']}, sector is {opp.get('sector', 'Verified')}, mode is {opp.get('mode', 'Online')}, and the deadline is {opp['deadline_display']}. Use our Barrier-to-Action Engine above to generate your customized step-by-step application plan!",
        "source": "verified-knowledge-base",
        "disclaimer": "AI Guidance only. Confirm with official portal."
    }


if __name__ == '__main__':
    port = int(os.getenv("PORT", 5000))
    debug_mode = os.getenv("FLASK_DEBUG", "false").lower() in ["true", "1"]
    print(f"[EduBridge AI] Server starting on http://0.0.0.0:{port} (Debug: {debug_mode})")
    app.run(host='0.0.0.0', port=port, debug=debug_mode)
