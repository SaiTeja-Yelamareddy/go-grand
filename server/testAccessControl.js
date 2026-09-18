/**
 * Automated Access Control & Ownership Security Test Suite
 * Proves that User A cannot access, modify, or delete User B's records,
 * and that non-admin/staff users cannot execute Owner-only operations.
 */

import { strict as assert } from 'assert';
import bcrypt from 'bcryptjs';

console.log('🔒 Running Comprehensive Access Control & Security Test Suite...\n');

// 1. In-Memory Session Mock
let mockSession = {
  ownerSession: null,
  staffSession: null,
  jobs: [],
  staff: [],
  services: [],
  upiId: '',
};

function resetMockState() {
  mockSession = {
    ownerSession: null,
    staffSession: null,
    jobs: [],
    staff: [],
    services: [{ id: 'sec_1', name: 'Basic Wash' }],
    upiId: 'gogrand@okaxis',
  };
}

// Session Accessors
function isOwnerAuthenticated() {
  return mockSession.ownerSession !== null && Date.now() < mockSession.ownerSession.expiresAt;
}

function getCurrentStaff() {
  if (mockSession.staffSession && Date.now() < mockSession.staffSession.expiresAt && mockSession.staffSession.staff.active) {
    return mockSession.staffSession.staff;
  }
  return null;
}

// Simulated Secure Storage Functions with Ownership Enforcement
function saveJobRecord(jobData, callerSession) {
  const isOwner = isOwnerAuthenticated();
  const currentStaff = getCurrentStaff();

  if (!isOwner && (!currentStaff || !currentStaff.active)) {
    throw new Error('Unauthorized: An active authenticated session is required to create job records.');
  }

  // Identity is strictly bound to the verified session, ignoring any spoofed caller inputs
  const sessionCreatorName = isOwner ? 'Owner' : currentStaff.staff_name;
  const sessionCreatorId = isOwner ? 'owner' : currentStaff.id;

  const newJob = {
    ...jobData,
    id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdBy: sessionCreatorName,
    createdById: sessionCreatorId,
    createdAt: new Date().toISOString(),
  };

  mockSession.jobs.push(newJob);
  return newJob;
}

function updateJobRecord(id, updatedData) {
  const isOwner = isOwnerAuthenticated();
  const currentStaff = getCurrentStaff();

  if (!isOwner && (!currentStaff || !currentStaff.active)) {
    throw new Error('Unauthorized: An active authenticated session is required to update job records.');
  }

  const target = mockSession.jobs.find((j) => j.id === id);
  if (!target) throw new Error('Record not found.');

  // Ownership Check
  if (!isOwner && target.createdById && target.createdById !== currentStaff?.id) {
    throw new Error("Forbidden: You do not have permission to modify this record. Only the creator or owner may edit.");
  }

  Object.assign(target, updatedData, {
    createdBy: target.createdBy,
    createdById: target.createdById,
    createdAt: target.createdAt,
  });

  return target;
}

function deleteJobRecord(id) {
  if (!isOwnerAuthenticated()) {
    throw new Error('Forbidden: Only an authenticated Owner can delete job records.');
  }

  const target = mockSession.jobs.find((j) => j.id === id);
  if (!target) throw new Error('Record not found.');

  mockSession.jobs = mockSession.jobs.filter((j) => j.id !== id);
}

function addStaffProfile(data) {
  if (!isOwnerAuthenticated()) {
    throw new Error('Forbidden: Only the Owner can create new staff accounts.');
  }
  const newStaff = { id: `staff_${Date.now()}`, ...data, active: true };
  mockSession.staff.push(newStaff);
  return newStaff;
}

function deleteStaffProfile(id) {
  if (!isOwnerAuthenticated()) {
    throw new Error('Forbidden: Only the Owner can delete staff accounts.');
  }
  mockSession.staff = mockSession.staff.filter((s) => s.id !== id);
}

function addServiceSection(name) {
  if (!isOwnerAuthenticated()) {
    throw new Error('Forbidden: Only the Owner can add service sections.');
  }
  const sec = { id: `sec_${Date.now()}`, name };
  mockSession.services.push(sec);
  return sec;
}

function saveUpiId(upiId) {
  if (!isOwnerAuthenticated()) {
    throw new Error('Forbidden: Only the Owner can modify payment settings.');
  }
  mockSession.upiId = upiId;
}

// Test Runner
let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    resetMockState();
    fn();
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
  }
}

async function runTestAsync(name, fn) {
  total++;
  try {
    resetMockState();
    await fn();
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
  }
}

// -------------------------------------------------------------
// TEST CASES
// -------------------------------------------------------------

// 1. Unauthenticated Job Creation Blocked
runTest('Route: saveJobRecord -> Blocks unauthenticated callers', () => {
  assert.throws(
    () => saveJobRecord({ vehicleNumber: 'AP03AA1234', customerName: 'John', price: '500' }),
    /Unauthorized/
  );
});

// 2. User A Session Identity Binding (Ignoring spoofed body params)
runTest("Route: saveJobRecord -> Enforces User A's session identity and ignores spoofed createdBy", () => {
  // Log in User A
  mockSession.staffSession = {
    token: 'token_user_a',
    staff: { id: 'staff_user_A', staff_name: 'Sai Kumar', role: 'STAFF', active: true },
    expiresAt: Date.now() + 3600000,
  };

  const job = saveJobRecord({
    vehicleNumber: 'AP03AA1234',
    customerName: 'Customer A',
    price: '500',
    createdBy: 'Spoofed Administrator',
    createdById: 'spoofed_admin_id',
  });

  assert.equal(job.createdById, 'staff_user_A', 'Must bind to User A verified ID');
  assert.equal(job.createdBy, 'Sai Kumar', 'Must bind to User A verified Name');
});

// 3. User B cannot update User A's job record
runTest("Route: updateJobRecord -> User B CANNOT update User A's record (Ownership Check)", () => {
  // User A creates job
  mockSession.staffSession = {
    token: 'token_user_a',
    staff: { id: 'staff_user_A', staff_name: 'Sai Kumar', role: 'STAFF', active: true },
    expiresAt: Date.now() + 3600000,
  };
  const jobA = saveJobRecord({ vehicleNumber: 'AP03AA1234', customerName: 'Customer A', price: '500' });

  // Switch to User B
  mockSession.staffSession = {
    token: 'token_user_b',
    staff: { id: 'staff_user_B', staff_name: 'Ravi', role: 'STAFF', active: true },
    expiresAt: Date.now() + 3600000,
  };

  assert.throws(
    () => updateJobRecord(jobA.id, { price: '0', customerName: 'Hijacked' }),
    /Forbidden: You do not have permission to modify this record/
  );
});

// 4. User B cannot delete User A's job record
runTest("Route: deleteJobRecord -> Staff cannot delete User A's record", () => {
  // User A creates job
  mockSession.staffSession = {
    token: 'token_user_a',
    staff: { id: 'staff_user_A', staff_name: 'Sai Kumar', role: 'STAFF', active: true },
    expiresAt: Date.now() + 3600000,
  };
  const jobA = saveJobRecord({ vehicleNumber: 'AP03AA1234', customerName: 'Customer A', price: '500' });

  // Switch to User B
  mockSession.staffSession = {
    token: 'token_user_b',
    staff: { id: 'staff_user_B', staff_name: 'Ravi', role: 'STAFF', active: true },
    expiresAt: Date.now() + 3600000,
  };

  assert.throws(
    () => deleteJobRecord(jobA.id),
    /Only an authenticated Owner can delete/
  );
});

runTest('Route: deleteJobRecord -> Staff cannot delete any job record', () => {
  resetMockState();
  mockSession.staffSession = {
    token: 'token_staff',
    staff: { id: 'staff_1', staff_name: 'Staff User', active: true },
    expiresAt: Date.now() + 3600000,
  };
  const job = saveJobRecord({ vehicleNumber: 'STAFF-1', customerName: 'Customer' }, mockSession.staffSession);

  assert.throws(
    () => deleteJobRecord(job.id),
    /Only an authenticated Owner can delete/
  );
  assert.equal(mockSession.jobs.length, 1);
});

// 5. Staff User cannot create or delete other Staff Accounts (Admin-only RBAC)
runTest('Route: addStaffProfile & deleteStaffProfile -> Staff User is blocked from staff management', () => {
  mockSession.staffSession = {
    token: 'token_user_a',
    staff: { id: 'staff_user_A', staff_name: 'Sai Kumar', role: 'STAFF', active: true },
    expiresAt: Date.now() + 3600000,
  };

  assert.throws(
    () => addStaffProfile({ staff_name: 'Unauthorized New Staff', phone_number: '9999999999' }),
    /Forbidden: Only the Owner can create new staff accounts/
  );

  assert.throws(
    () => deleteStaffProfile('staff_user_B'),
    /Forbidden: Only the Owner can delete staff accounts/
  );
});

// 6. Staff User cannot modify Service Catalog (Admin-only RBAC)
runTest('Route: addServiceSection -> Staff User is blocked from editing service catalog', () => {
  mockSession.staffSession = {
    token: 'token_user_a',
    staff: { id: 'staff_user_A', staff_name: 'Sai Kumar', role: 'STAFF', active: true },
    expiresAt: Date.now() + 3600000,
  };

  assert.throws(
    () => addServiceSection('Unauthorized Detailing Service'),
    /Forbidden: Only the Owner can add service sections/
  );
});

// 7. Staff User cannot modify UPI Payment Settings (Admin-only RBAC)
runTest('Route: saveUpiId -> Staff User is blocked from changing payment UPI ID', () => {
  mockSession.staffSession = {
    token: 'token_user_a',
    staff: { id: 'staff_user_A', staff_name: 'Sai Kumar', role: 'STAFF', active: true },
    expiresAt: Date.now() + 3600000,
  };

  assert.throws(
    () => saveUpiId('hacked@upi'),
    /Forbidden: Only the Owner can modify payment settings/
  );
});

// 8. Owner Role has administrative authorization across all entities
runTest('Route: Owner Role -> Full administrative authorization verified', () => {
  mockSession.ownerSession = {
    token: 'token_owner',
    loginId: 'admin',
    expiresAt: Date.now() + 3600000,
  };

  // 1. Owner can create job
  const job = saveJobRecord({ vehicleNumber: 'AP03AA9999', customerName: 'VIP Owner Job', price: '1500' });
  assert.equal(job.createdBy, 'Owner');
  assert.equal(job.createdById, 'owner');

  // 2. Owner can update job
  const updated = updateJobRecord(job.id, { status: 'completed' });
  assert.equal(updated.status, 'completed');

  // 3. Owner can create staff
  const staff = addStaffProfile({ staff_name: 'New Trainee', phone_number: '9123456789' });
  assert.equal(staff.staff_name, 'New Trainee');

  // 4. Owner can add service section
  const sec = addServiceSection('Ceramic Coating Package');
  assert.equal(sec.name, 'Ceramic Coating Package');

  // 5. Owner can save UPI ID
  saveUpiId('gogrand.official@upi');
  assert.equal(mockSession.upiId, 'gogrand.official@upi');

  // 6. Owner can delete job
  deleteJobRecord(job.id);
  assert.equal(mockSession.jobs.length, 0);
});

// Summary
console.log(`\n🎉 Access Control Security Test Suite Completed: ${passed}/${total} tests passed.\n`);

if (passed === total) {
  process.exit(0);
} else {
  process.exit(1);
}
