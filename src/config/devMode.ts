export const isDevMode = import.meta.env.VITE_DEV_MODE === 'true';

export const DEV_BRANCHES = [
  { id: 'branch-hcm', name: 'Chi nhanh HCM' },
  { id: 'branch-hn', name: 'Chi nhanh Ha Noi' },
];

export const DEV_USER = {
  id: 'dev-user-1',
  username: 'dev.admin',
  fullName: 'Dev Admin',
  role: 'ADMIN',
  branchId: DEV_BRANCHES[0].id,
  branchName: DEV_BRANCHES[0].name,
};
