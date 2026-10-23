#!/bin/bash
# Seed-staging script: --check no-op + safety guard regression (exit 2 expected)
cd /app
PY=/root/.venv/bin/python
S=backend/scripts/seed_staging.py
base() {
  export STAGING_MONGO_URL=mongodb://localhost:27017 STAGING_DB_NAME=daylaborcrew_staging_qa \
    STAGING_SUPERADMIN_EMAIL=superadmin@staging-dlc.com STAGING_SUPERADMIN_PASSWORD='Stg@Super123' \
    STAGING_ADMIN_EMAIL=admin@staging-dlc.com STAGING_ADMIN_PASSWORD='Stg@Admin123'
  unset STAGING_MONGO_HOST STAGING_STRIPE_MODE STAGING_CREW_EMAIL STAGING_CREW2_EMAIL STAGING_CREW2_PASSWORD STAGING_CONTRACTOR1_EMAIL
}
snap() { mongosh --quiet daylaborcrew_staging_qa --eval 'let o={};db.getCollectionNames().sort().forEach(c=>o[c]=db[c].find({},{_id:0}).toArray());print(JSON.stringify(o))' | md5sum; }
expect() { # name expected_code cmd...
  name=$1; exp=$2; shift 2
  out=$("$@" 2>&1); code=$?
  if [ "$code" == "$exp" ]; then echo "PASS $name (exit $code) :: $(echo "$out" | grep -E 'REFUSED|READY' | tail -1)"; else echo "FAIL $name expected $exp got $code :: $(echo "$out" | tail -3)"; fi
}
base
before=$(snap); expect check 0 $PY $S --check --allow-localhost; after=$(snap)
[ "$before" == "$after" ] && echo "PASS --check changed nothing" || echo "FAIL --check modified DB"
base; STAGING_DB_NAME=daylaborcrew expect prod_dbname 2 env STAGING_DB_NAME=daylaborcrew $PY $S --allow-localhost
base; expect no_allow_localhost 2 $PY $S
base; expect host_mismatch 2 env STAGING_MONGO_HOST=db.staging.example.com $PY $S --allow-localhost
base; expect reserved_domain 2 env STAGING_ADMIN_EMAIL=a@staging.test $PY $S --allow-localhost
base; expect weak_staff_pw 2 env STAGING_ADMIN_PASSWORD=weak $PY $S --allow-localhost
base; expect stripe_live 2 env STAGING_STRIPE_MODE=live $PY $S --allow-localhost
base; expect dup_email 2 env STAGING_CREW_EMAIL=contractor1@test.com $PY $S --allow-localhost
base; expect dup_email_case 2 env STAGING_CREW_EMAIL=Contractor1@Test.com $PY $S --allow-localhost
base; expect preview_host 2 env STAGING_MONGO_URL=mongodb://x.preview.emergentagent.com $PY $S
base; expect nonstage_host 2 env STAGING_MONGO_URL=mongodb://prod-db.example.com $PY $S
base; expect missing_url 2 env -u STAGING_MONGO_URL $PY $S --allow-localhost
base; expect substring_marker 2 env STAGING_DB_NAME=latestdb $PY $S --allow-localhost
after2=$(snap); [ "$before" == "$after2" ] && echo "PASS refused runs changed nothing" || echo "FAIL refused runs modified DB"
