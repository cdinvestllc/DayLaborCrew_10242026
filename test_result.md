#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
user_problem_statement: "Demo accounts (3 verified contractors, 2 crew, admin, super admin, TEST20 coupon). User reported: can't login with demo accounts."
backend:
  - task: "Login works from alias preview domain (CORS + /api/auth/csrf)"
    implemented: true
    working: "NA"
    file: "backend/.env (CORS_ORIGINS), backend/routes/auth_routes.py (GET /auth/csrf), backend/server.py (rejected-origin log)"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: false
        -agent: "user"
        -comment: "Root cause: app opened at https://crew-workforce.preview.emergentagent.com, API is the id-based preview URL; CORS preflight returned 400 (origin not trusted). Also CSRF cookie unreadable cross-host. Fixed by trusting origin + CSRF lookup endpoint used by axios interceptor."
frontend:
  - task: "Demo account login + dashboard write actions from both preview URLs"
    implemented: true
    working: "NA"
    file: "frontend/src/contexts/AuthContext.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Interceptor falls back to GET /api/auth/csrf when tdl_csrf cookie unreadable; retries once on 'CSRF validation failed'."

## Iteration 6 (main agent)
user_problem_statement_update: "Instant job list update after posting; dark-mode contrast for links/buttons; sample demo jobs; fix 'CSRF validation failed' when adding images; one-time Emergency Job Start fee $2.99 (admin-editable)."
agent_communication:
    -agent: "main"
    -message: "CSRF root cause: platform ingress rewrites tdl_session cookie to SameSite=None; Partitioned but tdl_csrf stays SameSite=Lax, so in embedded/cross-site preview the browser keeps session but drops csrf cookie (logs: header=False cookie=False). Fix: CSRF token is now HMAC(secret, session jti) — returned in login/register body (csrf_token) and GET /api/auth/csrf; server accepts header == csrf cookie OR session-bound token. Emergency: POST /api/jobs/ with is_emergency=true -> status pending_payment (hidden from crew) + requires_payment/emergency_fee; POST /api/payments/emergency/stripe/{job_id} -> Stripe URL; GET /api/payments/emergency/status/{session_id} publishes on paid; GET /api/payments/emergency/fee public; admin Settings 'Emergency Job Start Fee' (min 0.50). Demo jobs: 9 is_demo jobs seeded (Atlanta/Decatur/Marietta). SW v3 network-first; /api responses no-store."

## user_problem_statement (current): 1) one-command staging seed script; 2) test Stripe + PayPal payment & confirmation flows end to end on branch fix/payment-webhook-security-2026-10
backend:
  - task: "Staging seed script backend/scripts/seed_staging.py"
    implemented: true
    working: "NA"
    file: "backend/scripts/seed_staging.py"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Seeds 7 accounts + fixtures into isolated staging DB, guards, --reset/--check/--allow-localhost, verification report"
  - task: "Payment flows (Stripe checkout + status fulfilment, PayPal graceful when unconfigured)"
    implemented: true
    working: "NA"
    file: "backend/routes/payment_routes.py"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "PayPal subscription capture now uses decimal amount+currency match; PayPal API errors -> 502; removed inner emergentintegrations import in boost stripe"
agent_communication:
    - agent: "main"
      message: "Iteration 8 fixes: boost return flow (success_url now boost_session_id={CHECKOUT_SESSION_ID}; PayPal return boost_paypal=1&job_id + PayPal token; ContractorDashboard polls/captures and toasts), origin_url allow-listed via _origin() on all session creations, empty-body request.json() guarded (_json_body), admin-paid boost fulfils using tx.job_owner_id, polling paths check amount/currency (_status_matches), seed script validates passwords before any DB write + db-name safety assert, verified-contractor dead code removed, SubscriptionPage: single return handling (useRef), short polling, default to card when PayPal not configured, plan label shown. Plan-switch (update_subscription) left unchanged pending user decision."
