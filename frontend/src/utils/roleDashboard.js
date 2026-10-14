const DASHBOARD_BY_ROLE = {
  driver: '/driver-dashboard',
  owner: '/station-dashboard',
  admin: '/reports',
};

export function dashboardPathForRole(role) {
  return DASHBOARD_BY_ROLE[role] ?? '/';
}
