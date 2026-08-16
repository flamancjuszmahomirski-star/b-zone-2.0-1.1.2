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
## Runda 1.3 (2026-06 / v1.0.9) — scope implemented, needs verification
Backend: A1 object storage (POST /api/files -> Emergent Object Storage, GET content w/ legacy fallback + status utracony -> 410; startup orphan sweep), A2 partial project update (exclude_unset), B5 login lockout 5x->423/15min + register rate-limit 3/h/IP->429, B3 server-generated 16-char password (POST /users/{id}/reset-password with {}), E1b role guards (POST /reports & /extra-hours exclude contractor; DELETE /deliveries owner/manager; /register-push requires auth), G2 CORS credentials off, C3 weather returns None when no temperature.
Frontend: D (tab bar + insets.bottom, softwareKeyboardMode adjustResize, KeyboardAvoidingView in users/add-element modals), B3 password modal + Copy, B6 "Zmień hasło" in profile, C2b Android export via expo-file-system/legacy + expo-sharing, C4 readable 422 errors (detailToMessage), E3 instant photo thumbnail w/ uploading overlay, G3 PIN switch removed, H1 dead push-nudge removed, H2 schedule tile removed, H3 foreman deliveries metric = number, H4 st_zatwierdzone key + dedup new_password, H5 i18n literals (days, od/do, hints, locales, tys./k), H6 unreceive button (element screen) + report edit (report-new?edit=), H7 "Pokaż na zrzucie" + view ?focus= centering/highlight + receipts locate icon + image-lost fallback.
Admin: admin@bzone.app / MSbk566lLvI4b!U4 (must_change_password=True). DO NOT fail-login on admin (lockout).

## Runda 2 (v1.2.0 / vc132) — rectangles + web editor, implemented, needs wide verification
Backend: ElementIn+geometria (punkt|prostokat, 4 corners rel 0..1, center recompute), POST /views/{vid}/elements ADMIN-only, POST /views/{vid}/elements/batch (validate all codes BEFORE insert, single audit powielanie_elementow), PUT /elements/batch-geometry (admin, single audit), POST /elements/batch-archive, POST /elements/batch-restore (409 on code clash), PUT /elements/{eid} geometry fields admin-only (foreman może kod/typ/opis).
Frontend: view/[id].tsx mobile = NO editor at all (view+receive only), rect render (const border 2/scale, 30% fill, label threshold, 48dp hitSlop), web+admin renders GeometryEditor (src/components/web/GeometryEditor.tsx): tools point/rect (2-click+Shift+Esc), select/Ctrl/marquee, drag move, corner resize, Delete->archive confirm, undo/redo 30 steps (grid = 1 step), Ctrl+C/V, grid+linear duplicate with ghost preview + collision check via validate-codes, align 6/distribute 2/unify/mirror 2, snap grid (% width, visible), wheel zoom to cursor, middle/space pan, fit/100%, cursor coords.
Test data in preview: project TEST_R2_EDITOR (id 54680c4c-3ec3-471c-bd79-c6953b767e76), view "Elewacja płd." id 9f5a0846-8d93-4ad1-9e91-d05e0d2a0d8d (OKN-01 rect + OKN-99), perf view "PERF 200" id 9e8e4628-2885-4bce-9c73-f9d2b1375f49 (200 rects P-001..P-200).
Verified by main agent (browser): draw 2-click, form save, select, grid dup collision-before-create, grid create 5, Ctrl+Z one-step undo, foreman mobile path (no editor, rects render), I.9 403s via curl.
Accounts: admin@bzone.app / MSbk566lLvI4b!U4 ; foreman test_r2_foreman@test.pl / ForemanPass123456. NIGDY failed-login na admin (lockout).
