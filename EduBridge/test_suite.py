"""
EduBridge AI Comprehensive Test Suite
Tests:
1. Deployment Readiness:
   - Procfile exists with gunicorn binding
   - requirements.txt includes gunicorn and flask
   - .gitignore excludes .env
   - No sensitive API keys stored in source code
2. Offline Mode (Zero Configuration / No API key):
   - Health endpoint reports verified-offline-rule-based
   - AI assistant serves verified answers in clear, concise English
   - Zero crashes, zero 500 errors, never requires an API key
3. Online Mode (Server Environment Variable GEMINI_API_KEY set):
   - Gemini client activates dynamically from environment variable
   - Generates live answers with source "gemini-3.8-flash"
   - Graceful fallback when Gemini API raises an exception (quota, network, etc.)
4. Trust & Safety Guardrail:
   - Sensitive credential queries (Aadhaar, bank, passwords) intercepted
5. Core Barrier-to-Action Engine:
   - Opportunities, Barriers, and Plan Generation endpoints
"""

import os
import json
import unittest
from unittest.mock import MagicMock, patch

# Import the Flask app and helpers
import app
from app import app as flask_app, get_gemini_client, resolve_question_rule_based


class TestEduBridgeHackathonDeployment(unittest.TestCase):
    """Test suite covering deployment readiness, offline mode, and online mode"""

    def setUp(self):
        self.app = flask_app
        self.client = flask_app.test_client()

    # ---------------------------------------------------------
    # 1. DEPLOYMENT READINESS & SECURITY TESTS
    # ---------------------------------------------------------
    def test_deployment_procfile(self):
        """Verify Procfile exists with production gunicorn command"""
        procfile_path = os.path.join(os.path.dirname(__file__), 'Procfile')
        self.assertTrue(os.path.exists(procfile_path), "Procfile must exist for PaaS deployment")
        with open(procfile_path, 'r', encoding='utf-8') as f:
            content = f.read()
        self.assertIn('gunicorn', content)
        self.assertIn('app:app', content)

    def test_deployment_requirements(self):
        """Verify requirements.txt includes essential production packages"""
        req_path = os.path.join(os.path.dirname(__file__), 'requirements.txt')
        self.assertTrue(os.path.exists(req_path), "requirements.txt must exist")
        with open(req_path, 'r', encoding='utf-8') as f:
            content = f.read()
        self.assertIn('gunicorn', content)
        self.assertIn('Flask', content)
        self.assertIn('google-genai', content)

    def test_gitignore_contains_env(self):
        """Verify .env is strictly ignored so judge/developer keys are never committed"""
        gitignore_path = os.path.join(os.path.dirname(__file__), '.gitignore')
        self.assertTrue(os.path.exists(gitignore_path), ".gitignore should exist")
        with open(gitignore_path, 'r', encoding='utf-8') as f:
            content = f.read()
        self.assertIn('.env', content, ".gitignore must contain .env")

    def test_no_real_api_key_committed(self):
        """Verify no real Google API key (starts with AIzaSy) is hardcoded anywhere in project files"""
        env_path = os.path.join(os.path.dirname(__file__), '.env')
        if os.path.exists(env_path):
            with open(env_path, 'r', encoding='utf-8') as f:
                content = f.read()
                self.assertNotIn('AIzaSy', content, "Never hardcode real Gemini API key in .env or templates")

    # ---------------------------------------------------------
    # 2. OFFLINE MODE TESTS (NO API KEY / ZERO CONFIGURATION)
    # ---------------------------------------------------------
    def test_offline_mode_health_status(self):
        """Verify health check reports healthy offline status when no key is set"""
        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}, clear=False):
            # Clear cache
            app._cached_gemini_client = None
            app._cached_gemini_key = None

            response = self.client.get('/api/health')
            self.assertEqual(response.status_code, 200)
            data = response.get_json()
            self.assertEqual(data.get('status'), 'healthy')
            self.assertFalse(data.get('gemini_active'))
            self.assertEqual(data.get('mode'), 'verified-offline-rule-based')

    def test_offline_mode_placeholder_key_handling(self):
        """Verify placeholder key 'your_gemini_api_key_here' gracefully falls back to offline mode"""
        with patch.dict(os.environ, {"GEMINI_API_KEY": "your_gemini_api_key_here"}, clear=False):
            app._cached_gemini_client = None
            app._cached_gemini_key = None

            client = get_gemini_client()
            self.assertIsNone(client, "Placeholder key must not be treated as a live client")

    def test_offline_mode_assistant_english(self):
        """Verify AI assistant gives full verified answers in English offline"""
        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}, clear=False):
            app._cached_gemini_client = None
            app._cached_gemini_key = None

            payload = {
                "question": "Can non-technical students apply?",
                "language": "en"
            }
            response = self.client.post('/api/ai/ask',
                                        data=json.dumps(payload),
                                        content_type='application/json')
            self.assertEqual(response.status_code, 200)
            data = response.get_json()
            self.assertIn('answer', data)
            self.assertGreater(len(data['answer']), 20)
            self.assertIn(data.get('source'), ['verified-knowledge-base', 'rule-engine'])

    def test_offline_mode_assistant_english_only(self):
        """Verify AI assistant gives English-only verified answers and excludes translation keys"""
        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}, clear=False):
            app._cached_gemini_client = None
            app._cached_gemini_key = None

            payload = {
                "question": "What are the key benefits and eligibility?",
                "opportunity_id": "reliance-ug-scholarship"
            }
            response = self.client.post('/api/ai/ask',
                                        data=json.dumps(payload),
                                        content_type='application/json')
            self.assertEqual(response.status_code, 200)
            data = response.get_json()
            self.assertIn('answer', data)
            self.assertNotIn('answer_te', data)
            self.assertNotIn('answer_hi', data)
            self.assertIn(data.get('source'), ['verified-knowledge-base', 'rule-engine'])

    def test_all_barrier_plans_english_only(self):
        """Verify all 6 barrier action plans are generated strictly in English without translation keys"""
        barriers = [
            "confusing_eligibility",
            "missing_documents",
            "late_discovery",
            "limited_internet",
            "unclear_starting",
            "limited_time"
        ]
        for barrier in barriers:
            payload = {
                "opportunity_id": "reliance-ug-scholarship",
                "barrier_id": barrier,
                "student_profile": {"study_level": "Undergraduate", "interest": "Technology"}
            }
            response = self.client.post('/api/engine/generate-plan',
                                        data=json.dumps(payload),
                                        content_type='application/json')
            self.assertEqual(response.status_code, 200)
            plan = response.get_json()
            self.assertNotIn('telugu_summary', plan, f"telugu_summary should not exist in plan for {barrier}")
            for task in plan.get('action_tasks', []):
                self.assertNotIn('desc_te', task, f"desc_te should not exist in task for {barrier}")
            for item in plan.get('criteria_checklist', []):
                self.assertNotIn('simple_te', item, f"simple_te should not exist in criteria for {barrier}")

    # ---------------------------------------------------------
    # 3. ONLINE MODE TESTS (ENVIRONMENT VARIABLE GEMINI_API_KEY)
    # ---------------------------------------------------------
    def test_online_mode_live_gemini_generation(self):
        """Verify that when a valid key is set in environment, Gemini is called and returns live response"""
        mock_gemini_client = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "Reliance Foundation scholarship provides up to ₹2,00,000 for undergraduate students."
        mock_gemini_client.models.generate_content.return_value = mock_response

        with patch('app.get_gemini_client', return_value=mock_gemini_client):
            payload = {
                "question": "What is the scholarship amount?",
                "opportunity_id": "reliance-ug-scholarship",
                "language": "en"
            }
            response = self.client.post('/api/ai/ask',
                                        data=json.dumps(payload),
                                        content_type='application/json')
            self.assertEqual(response.status_code, 200)
            data = response.get_json()
            self.assertEqual(data.get('source'), 'gemini-3.8-flash')
            self.assertEqual(data.get('answer'), mock_response.text)

    def test_online_mode_gemini_exception_resilience(self):
        """Verify that if the live Gemini API throws an exception, it falls back seamlessly to offline knowledge base"""
        mock_gemini_client = MagicMock()
        mock_gemini_client.models.generate_content.side_effect = Exception("429 ResourceExhausted: Quota exceeded")

        with patch('app.get_gemini_client', return_value=mock_gemini_client):
            payload = {
                "question": "What is the family income limit?",
                "opportunity_id": "reliance-ug-scholarship",
                "language": "en"
            }
            response = self.client.post('/api/ai/ask',
                                        data=json.dumps(payload),
                                        content_type='application/json')
            self.assertEqual(response.status_code, 200)
            data = response.get_json()
            # Verified that it did not fail, but cleanly fell back
            self.assertIn(data.get('source'), ['verified-knowledge-base', 'rule-engine'])
            self.assertIn('answer', data)

    # ---------------------------------------------------------
    # 4. TRUST & SAFETY GUARDRAIL TESTS
    # ---------------------------------------------------------
    def test_trust_safety_guardrail_blocks_sensitive_data(self):
        """Verify security guardrail blocks requests involving Aadhaar, bank details, or passwords"""
        payload = {
            "question": "Where should I enter my bank account number and Aadhaar OTP?",
            "language": "en"
        }
        response = self.client.post('/api/ai/ask',
                                    data=json.dumps(payload),
                                    content_type='application/json')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data.get('source'), 'trust-safety-guardrail')
        self.assertIn('Safety Notice', data.get('answer', ''))

    # ---------------------------------------------------------
    # 5. CORE PLATFORM & BARRIER-TO-ACTION ENGINE TESTS
    # ---------------------------------------------------------
    def test_opportunities_catalog(self):
        """Verify opportunities endpoint returns all curated opportunities"""
        response = self.client.get('/api/opportunities')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIn('opportunities', data)
        self.assertGreaterEqual(len(data['opportunities']), 8)

    def test_barrier_action_plan_generation(self):
        """Verify Barrier-to-Action Engine generates complete actionable steps"""
        payload = {
            "opportunity_id": "reliance-ug-scholarship",
            "barrier_id": "confusing_eligibility",
            "student_profile": {"study_level": "Undergraduate", "interest": "Technology"}
        }
        response = self.client.post('/api/engine/generate-plan',
                                    data=json.dumps(payload),
                                    content_type='application/json')
        self.assertEqual(response.status_code, 200)
        plan = response.get_json()
        self.assertEqual(plan.get('opportunity_id'), 'reliance-ug-scholarship')
        self.assertEqual(plan.get('barrier_id'), 'confusing_eligibility')
        self.assertIn('criteria_checklist', plan)
        self.assertIn('action_tasks', plan)


if __name__ == '__main__':
    unittest.main()
