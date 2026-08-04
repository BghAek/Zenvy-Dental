import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { billingSessionResponseSchema } from '@zenvy/shared';
import { api } from '../api';
import { sessionKeys } from './session';

export const settingsKeys = {
  staff: ['settings', 'staff'] as const,
};

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: 'CLINIC_OWNER' | 'CLINIC_STAFF';
  createdAt: string;
}

export interface StaffInvite {
  id: string;
  email: string;
  expiresAt: string;
  createdAt: string;
}

// Initial mock staff data
const DEFAULT_STAFF: StaffMember[] = [
  {
    id: 'staff-1',
    name: 'Dr Claire Fontaine',
    email: 'docteur@lumiere-dentaire.fr',
    role: 'CLINIC_OWNER',
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'staff-2',
    name: 'Dr Jean Dupont',
    email: 'jean.dupont@lumiere-dentaire.fr',
    role: 'CLINIC_STAFF',
    createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const DEFAULT_INVITES: StaffInvite[] = [
  {
    id: 'invite-1',
    email: 'assistant@lumiere-dentaire.fr',
    expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  },
];

// Helper to get staff from localStorage
function getStoredStaff(currentUserEmail?: string, currentUserName?: string): StaffMember[] {
  const stored = localStorage.getItem('zenvy_mock_staff');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // Fallback
    }
  }

  // If not set, initialize with default staff. Align owner email with current user if possible.
  const staff = [...DEFAULT_STAFF];
  if (currentUserEmail) {
    const ownerIndex = staff.findIndex(s => s.role === 'CLINIC_OWNER');
    if (ownerIndex !== -1) {
      staff[ownerIndex].email = currentUserEmail;
      if (currentUserName) staff[ownerIndex].name = currentUserName;
    }
  }
  localStorage.setItem('zenvy_mock_staff', JSON.stringify(staff));
  return staff;
}

// Helper to get invites from localStorage
function getStoredInvites(): StaffInvite[] {
  const stored = localStorage.getItem('zenvy_mock_invites');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // Fallback
    }
  }
  localStorage.setItem('zenvy_mock_invites', JSON.stringify(DEFAULT_INVITES));
  return DEFAULT_INVITES;
}

// 1. Clinic Profile & AI Config Mutation
export function useUpdateClinic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      name?: string;
      phone?: string | null;
      address?: string | null;
      timezone?: string;
      onboardingStatus?: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      aiConfig?: any;
    }) => {
      // Get current stored clinic or default
      const stored = localStorage.getItem('zenvy_mock_clinic');
      const current = stored ? JSON.parse(stored) : {};
      
      const updated = {
        ...current,
        ...payload,
        aiConfig: {
          ...(current.aiConfig || {}),
          ...(payload.aiConfig || {}),
        },
      };
      
      localStorage.setItem('zenvy_mock_clinic', JSON.stringify(updated));
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 600));
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.me });
    },
  });
}

// 2. Staff & Invites list query
export function useStaffList(currentUserEmail?: string, currentUserName?: string) {
  return useQuery({
    queryKey: settingsKeys.staff,
    queryFn: async () => {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 400));
      return {
        members: getStoredStaff(currentUserEmail, currentUserName),
        invites: getStoredInvites(),
      };
    },
  });
}

// 3. Remove Staff member mutation
export function useRemoveStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const staff = getStoredStaff();
      const updated = staff.filter(s => s.id !== id);
      localStorage.setItem('zenvy_mock_staff', JSON.stringify(updated));
      await new Promise(resolve => setTimeout(resolve, 500));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.staff });
    },
  });
}

// 4. Revoke/delete pending staff invite mutation
export function useRevokeInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const invites = getStoredInvites();
      const updated = invites.filter(i => i.id !== id);
      localStorage.setItem('zenvy_mock_invites', JSON.stringify(updated));
      await new Promise(resolve => setTimeout(resolve, 500));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.staff });
    },
  });
}

// 5. Create staff invitation mutation
export function useInviteStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => {
      // Simulate check for already in clinic
      const staff = getStoredStaff();
      if (staff.some(s => s.email.toLowerCase() === email.toLowerCase())) {
        throw new Error('USER_ALREADY_IN_CLINIC');
      }

      const invites = getStoredInvites();
      if (invites.some(i => i.email.toLowerCase() === email.toLowerCase())) {
        throw new Error('INVITE_ALREADY_EXISTS');
      }

      const newInvite: StaffInvite = {
        id: `invite-${Math.random().toString(36).substr(2, 9)}`,
        email: email.toLowerCase(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
      };

      localStorage.setItem('zenvy_mock_invites', JSON.stringify([...invites, newInvite]));
      await newPromise(resolve => setTimeout(resolve, 600));
      return newInvite;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.staff });
    },
  });
}

// Helper to wrap promise with timeout/resolve
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const newPromise = (callback: (resolve: (value: any) => void) => void) => {
  return new Promise(callback);
};

// 6. Billing Checkout Mutation
export function useBillingCheckout() {
  return useMutation({
    mutationFn: async () => {
      try {
        // Try calling the real backend POST /billing/checkout-session
        const res = await api.post('/billing/checkout-session', billingSessionResponseSchema);
        return res;
      } catch (err) {
        console.warn('Real Stripe checkout failed, falling back to mock.', err);
        // Fallback to simulating a Stripe redirection by returning a mock URL
        // that will flag the checkout success after redirect
        await new Promise(resolve => setTimeout(resolve, 1000));
        return {
          url: `${window.location.origin}/settings/subscription?checkout=success`,
        };
      }
    },
  });
}

// 7. Billing Portal Mutation
export function useBillingPortal() {
  return useMutation({
    mutationFn: async () => {
      try {
        // Try calling the real backend POST /billing/portal-session
        const res = await api.post('/billing/portal-session', billingSessionResponseSchema);
        return res;
      } catch (err) {
        console.warn('Real Stripe billing portal failed, falling back to mock.', err);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return {
          url: `https://billing.stripe.com/p/session/mock_${Math.random().toString(36).substr(2, 9)}`,
        };
      }
    },
  });
}
