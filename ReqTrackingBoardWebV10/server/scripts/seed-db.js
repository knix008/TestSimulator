import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { initDatabase, queryOne, insert, query } from '../db.js';

const SAMPLE_USERS = [
  { username: 'viewer1', password: 'viewer1', displayName: 'Viewer User', email: 'viewer1@example.com', role: 'user', permission: 'view' },
  { username: 'editor1', password: 'editor1', displayName: 'Editor User', email: 'editor1@example.com', role: 'user', permission: 'edit' },
];

const SAMPLE_REQUIREMENTS = [
  { reqId: 'REQ-001', title: 'User Login', description: 'Users must log in with username and password.', category: 'Functional', priority: 'Critical', status: 'Approved', owner: 'Kim', version: '1.0' },
  { reqId: 'REQ-002', title: 'User Logout', description: 'Logged-in users must log out securely.', category: 'Functional', priority: 'High', status: 'Approved', owner: 'Kim', version: '1.0' },
  { reqId: 'REQ-003', title: 'Requirement Management', description: 'Users can view and manage requirements based on permission.', category: 'Functional', priority: 'Critical', status: 'Active', owner: 'Lee', version: '1.0' },
  { reqId: 'REQ-004', title: 'Test Case Tracking', description: 'Track test case status and execution results per requirement.', category: 'Functional', priority: 'High', status: 'Active', owner: 'Park', version: '1.0' },
  { reqId: 'REQ-005', title: 'Excel Import/Export', description: 'Import and export requirements and test cases via Excel.', category: 'Integration', priority: 'Medium', status: 'Draft', owner: 'Choi', version: '1.0' },
];

const SAMPLE_TEST_CASES = [
  { tcId: 'TC-001', reqId: 'REQ-001', title: 'Valid login', description: 'Login with correct credentials', steps: '1. Enter username\n2. Enter password\n3. Click Login', expectedResult: 'Redirect to dashboard', status: 'Passed', result: 'OK', executedBy: 'Tester A' },
  { tcId: 'TC-002', reqId: 'REQ-001', title: 'Invalid password', description: 'Login with wrong password', steps: '1. Enter valid username\n2. Enter wrong password', expectedResult: 'Error message shown', status: 'Passed', result: 'OK', executedBy: 'Tester A' },
  { tcId: 'TC-003', reqId: 'REQ-002', title: 'Logout', description: 'User logs out', steps: '1. Click Logout', expectedResult: 'Session cleared', status: 'Passed', result: 'OK', executedBy: 'Tester B' },
  { tcId: 'TC-004', reqId: 'REQ-003', title: 'Viewer read-only', description: 'Viewer cannot edit requirements', steps: '1. Login as viewer\n2. Try to add requirement', expectedResult: '403 Forbidden', status: 'Passed', result: 'OK', executedBy: 'Tester B' },
  { tcId: 'TC-005', reqId: 'REQ-003', title: 'Editor can edit', description: 'Editor can modify requirements', steps: '1. Login as editor\n2. Edit requirement', expectedResult: 'Changes saved', status: 'Passed', result: 'OK', executedBy: 'Tester B' },
  { tcId: 'TC-006', reqId: 'REQ-004', title: 'Update TC status', description: 'Change test case status to Passed', steps: '1. Open test case\n2. Set status Passed', expectedResult: 'Status and executed_at saved', status: 'In Progress', result: '', executedBy: '' },
  { tcId: 'TC-007', reqId: 'REQ-005', title: 'Excel export', description: 'Export all data to Excel', steps: '1. Go to Reports\n2. Click Export', expectedResult: 'xlsx file downloaded', status: 'Not Run', result: '', executedBy: '' },
];

async function seedUsers(adminId) {
  for (const u of SAMPLE_USERS) {
    const exists = await queryOne('SELECT id FROM users WHERE username = ?', [u.username]);
    if (exists) {
      console.log(`  User exists: ${u.username}`);
      continue;
    }
    const hash = bcrypt.hashSync(u.password, 10);
    await insert(
      'INSERT INTO users (username, password, display_name, email, role, permission) VALUES (?, ?, ?, ?, ?, ?)',
      [u.username, hash, u.displayName, u.email, u.role, u.permission]
    );
    console.log(`  User created: ${u.username} (${u.permission})`);
  }
  return adminId;
}

async function seedRequirements(adminId) {
  const reqMap = {};
  for (const r of SAMPLE_REQUIREMENTS) {
    let row = await queryOne('SELECT id FROM requirements WHERE req_id = ?', [r.reqId]);
    if (!row) {
      const id = await insert(`
        INSERT INTO requirements (req_id, title, description, category, priority, status, owner, version, created_by, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [r.reqId, r.title, r.description, r.category, r.priority, r.status, r.owner, r.version, adminId, adminId]);
      row = { id };
      console.log(`  Requirement created: ${r.reqId}`);
    } else {
      console.log(`  Requirement exists: ${r.reqId}`);
    }
    reqMap[r.reqId] = row.id;
  }
  return reqMap;
}

async function seedTestCases(reqMap) {
  for (const tc of SAMPLE_TEST_CASES) {
    const exists = await queryOne('SELECT id FROM test_cases WHERE tc_id = ?', [tc.tcId]);
    if (exists) {
      console.log(`  Test case exists: ${tc.tcId}`);
      continue;
    }
    const reqId = reqMap[tc.reqId];
    if (!reqId) {
      console.log(`  Skipped ${tc.tcId}: requirement ${tc.reqId} not found`);
      continue;
    }
    await insert(`
      INSERT INTO test_cases (tc_id, requirement_id, title, description, steps, expected_result, status, result, executed_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [tc.tcId, reqId, tc.title, tc.description, tc.steps, tc.expectedResult, tc.status, tc.result, tc.executedBy]);
    console.log(`  Test case created: ${tc.tcId}`);
  }
}

async function main() {
  console.log('Initializing database...');
  await initDatabase();

  const admin = await queryOne('SELECT id FROM users WHERE username = ?', ['admin']);
  console.log('\nSeeding users...');
  await seedUsers(admin.id);

  console.log('\nSeeding requirements...');
  const reqMap = await seedRequirements(admin.id);

  console.log('\nSeeding test cases...');
  await seedTestCases(reqMap);

  const [userCount] = await query('SELECT COUNT(*) as c FROM users');
  const [reqCount] = await query('SELECT COUNT(*) as c FROM requirements');
  const [tcCount] = await query('SELECT COUNT(*) as c FROM test_cases');

  console.log('\n--- Storage Summary ---');
  console.log(`  Users:        ${userCount.c}`);
  console.log(`  Requirements: ${reqCount.c}`);
  console.log(`  Test Cases:   ${tcCount.c}`);
  console.log('\nDone.');
  process.exit(0);
}

main().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
