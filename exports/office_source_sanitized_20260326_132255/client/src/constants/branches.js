/**
 * Branch Constants for SpeedNet Office Application
 * These branch names are used throughout the application for free ID registration
 */

// List of available branches for Free ID registration
export const BRANCHES = [
  { id: 1, name: 'Corporate Office', code: 'CO' },
  { id: 2, name: 'Shonadanga Office', code: 'SHA' },
  { id: 3, name: 'Gollamari Office', code: 'GOL' },
  { id: 4, name: 'Boyra Office', code: 'BOY' }
];

// Get branch name by code
export const getBranchNameByCode = (code) => {
  const branch = BRANCHES.find(b => b.code === code);
  return branch ? branch.name : code;
};

// Get branch code by name
export const getBranchCodeByName = (name) => {
  const branch = BRANCHES.find(b => b.name === name);
  return branch ? branch.code : '';
};

// Get all branch names as array
export const getBranchNames = () => BRANCHES.map(b => b.name);

// Get all branch codes as array
export const getBranchCodes = () => BRANCHES.map(b => b.code);
