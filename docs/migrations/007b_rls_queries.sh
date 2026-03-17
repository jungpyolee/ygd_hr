#!/bin/bash
# Run remaining RLS policies for Epic D
source /Users/jungpyo/Desktop/ygd/ygd_hr/.env.local

BASE="https://api.supabase.com/v1/projects/ymvdjxzkjodasctktunh/database/query"
AUTH="Authorization: Bearer $SUPABASE_ACCESS_TOKEN"
CT="Content-Type: application/json"

run_query() {
  curl -s -X POST "$BASE" -H "$AUTH" -H "$CT" --data-binary "{\"query\":\"$1\"}"
  echo ""
}

# weekly_schedules
run_query "CREATE POLICY ws_emp ON weekly_schedules FOR SELECT TO authenticated USING (status = 'confirmed')"

# schedule_slots
run_query "CREATE POLICY ss_admin ON schedule_slots FOR ALL USING (is_admin())"
run_query "CREATE POLICY ss_emp ON schedule_slots FOR SELECT TO authenticated USING (profile_id = auth.uid() AND EXISTS (SELECT 1 FROM weekly_schedules ws WHERE ws.id = schedule_slots.weekly_schedule_id AND ws.status = 'confirmed'))"

# substitute_requests
run_query "CREATE POLICY sr_admin ON substitute_requests FOR ALL USING (is_admin())"
run_query "CREATE POLICY sr_req_view ON substitute_requests FOR SELECT TO authenticated USING (requester_id = auth.uid())"
run_query "CREATE POLICY sr_req_ins ON substitute_requests FOR INSERT TO authenticated WITH CHECK (requester_id = auth.uid())"
run_query "CREATE POLICY sr_eligible ON substitute_requests FOR SELECT TO authenticated USING (status = 'approved' AND auth.uid() = ANY(eligible_profile_ids))"

# substitute_responses
run_query "CREATE POLICY srp_admin ON substitute_responses FOR ALL USING (is_admin())"
run_query "CREATE POLICY srp_own ON substitute_responses FOR ALL TO authenticated USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid())"
run_query "CREATE POLICY srp_parties ON substitute_responses FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM substitute_requests sr WHERE sr.id = substitute_responses.request_id AND (sr.requester_id = auth.uid() OR auth.uid() = ANY(sr.eligible_profile_ids))))"

# Triggers
run_query "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_weekly_schedules_updated_at') THEN CREATE TRIGGER trg_weekly_schedules_updated_at BEFORE UPDATE ON weekly_schedules FOR EACH ROW EXECUTE FUNCTION set_updated_at(); END IF; END \$\$"
run_query "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_schedule_slots_updated_at') THEN CREATE TRIGGER trg_schedule_slots_updated_at BEFORE UPDATE ON schedule_slots FOR EACH ROW EXECUTE FUNCTION set_updated_at(); END IF; END \$\$"
run_query "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_substitute_requests_updated_at') THEN CREATE TRIGGER trg_substitute_requests_updated_at BEFORE UPDATE ON substitute_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at(); END IF; END \$\$"

echo "All done!"
