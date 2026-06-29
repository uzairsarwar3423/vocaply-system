import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import { useAuthStore } from '@/features/auth/store/auth.store'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export interface CreateTeamPayload {
  name: string
  slug: string
}

export interface InviteMembersPayload {
  emails: string[]
  role?: 'MEMBER' | 'MANAGER' | 'ADMIN'
}

export const useOnboarding = () => {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user, setUser } = useAuthStore()

  // 1. Check if slug is available
  const checkSlugMutation = useMutation({
    mutationFn: async (slug: string): Promise<{ available: boolean; slug: string; suggestion?: string }> => {
      const response = await api.get<{ data: { available: boolean; slug: string; suggestion?: string } }>(`/teams/check-slug`, {
        params: { slug }
      })
      return response.data.data
    }
  })

  // 2. Create a team
  const createTeamMutation = useMutation({
    mutationFn: async (payload: CreateTeamPayload) => {
      const response = await api.post<{ data: { id: string; name: string; slug: string } }>(
        '/teams',
        payload
      )
      return response.data.data
    },
    onSuccess: (data) => {
      // Update local auth store user's team information
      if (user) {
        setUser({
          ...user,
          teamId: data.id,
          team: { id: data.id, name: data.name },
          role: 'ADMIN' // The team creator becomes OWNER/ADMIN
        })
      }
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
    onError: (err: any) => {
      if (err.response?.data?.error?.code === 'DUPLICATE') return
      const errMsg = err.response?.data?.error?.message || 'Failed to create team. Please try again.'
      toast.error(errMsg)
    }
  })

  // 2.5 Update a team
  const updateTeamMutation = useMutation({
    mutationFn: async (payload: { name?: string; slug?: string }) => {
      const response = await api.patch<{ data: { id: string; name: string; slug: string } }>(
        '/teams/me',
        payload
      )
      return response.data.data
    },
    onSuccess: (data) => {
      if (user) {
        setUser({
          ...user,
          team: { ...user.team, name: data.name } as any
        })
      }
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
    onError: (err: any) => {
      if (err.response?.data?.error?.code === 'DUPLICATE') return
      const errMsg = err.response?.data?.error?.message || 'Failed to update team. Please try again.'
      toast.error(errMsg)
    }
  })

  // 3. Invite members
  const inviteMembersMutation = useMutation({
    mutationFn: async (payload: InviteMembersPayload) => {
      const response = await api.post<{ data: any }>('/teams/me/invite', payload)
      return response.data.data
    },
    onSuccess: () => {
      toast.success('Invitations sent successfully!')
    },
    onError: (err: any) => {
      const errMsg = err.response?.data?.error?.message || 'Failed to send invites. Please try again.'
      toast.error(errMsg)
    }
  })

  // 4. Complete onboarding (Patch auth/me with onboardingCompleted: true)
  const completeOnboardingMutation = useMutation({
    mutationFn: async () => {
      const response = await api.patch<{ data: { user: any } }>('/auth/me', {
        onboardingCompleted: true
      })
      return response.data.data
    },
    onSuccess: (data) => {
      // Update local store
      if (user) {
        setUser({
          ...user,
          onboardingCompleted: true
        })
      }
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
    onError: (err: any) => {
      const errMsg = err.response?.data?.error?.message || 'Failed to complete onboarding. Please try again.'
      toast.error(errMsg)
    }
  })

  return {
    checkSlug: checkSlugMutation.mutateAsync,
    isCheckingSlug: checkSlugMutation.isPending,
    createTeam: createTeamMutation.mutateAsync,
    isCreatingTeam: createTeamMutation.isPending,
    updateTeam: updateTeamMutation.mutateAsync,
    isUpdatingTeam: updateTeamMutation.isPending,
    inviteMembers: inviteMembersMutation.mutateAsync,
    isInviting: inviteMembersMutation.isPending,
    completeOnboarding: completeOnboardingMutation.mutateAsync,
    isCompleting: completeOnboardingMutation.isPending
  }
}
