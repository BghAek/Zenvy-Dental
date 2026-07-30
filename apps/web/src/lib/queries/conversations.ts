import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import {
  ListConversationsQuery,
  conversationListResponseSchema,
  conversationSchema,
  messageListResponseSchema,
  SendMessageRequest,
  messageSchema,
} from '@zenvy/shared';

export const conversationKeys = {
  all: ['conversations'] as const,
  lists: () => [...conversationKeys.all, 'list'] as const,
  list: (filters: ListConversationsQuery) => [...conversationKeys.lists(), filters] as const,
  details: () => [...conversationKeys.all, 'detail'] as const,
  detail: (id: string) => [...conversationKeys.details(), id] as const,
  messages: (id: string) => [...conversationKeys.detail(id), 'messages'] as const,
};

export function useConversations(filters: ListConversationsQuery) {
  return useInfiniteQuery({
    queryKey: conversationKeys.list(filters),
    queryFn: async ({ pageParam = undefined }) => {
      return api.get('/conversations', conversationListResponseSchema, {
        ...filters,
        cursor: pageParam as string | undefined,
      });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    refetchInterval: 5000,
  });
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: id ? conversationKeys.detail(id) : [],
    queryFn: () => (id ? api.get(`/conversations/${id}`, conversationSchema) : null),
    enabled: !!id,
    refetchInterval: 5000,
  });
}

export function useMessages(id: string | null) {
  return useInfiniteQuery({
    queryKey: id ? conversationKeys.messages(id) : [],
    queryFn: async ({ pageParam = undefined }) => {
      if (!id) throw new Error('No conversation ID');
      return api.get(`/conversations/${id}/messages`, messageListResponseSchema, {
        cursor: pageParam as string | undefined,
      });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    enabled: !!id,
    refetchInterval: 5000,
  });
}

export function useSendMessage(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SendMessageRequest) =>
      api.post(`/conversations/${id}/messages`, messageSchema, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: conversationKeys.messages(id) });
      queryClient.invalidateQueries({ queryKey: conversationKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: conversationKeys.lists() });
    },
  });
}

export function useTakeoverConversation(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post(`/conversations/${id}/takeover`, conversationSchema),
    onSuccess: (updatedConversation) => {
      queryClient.setQueryData(conversationKeys.detail(id), updatedConversation);
      queryClient.invalidateQueries({ queryKey: conversationKeys.lists() });
    },
  });
}

export function useReleaseConversation(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post(`/conversations/${id}/release`, conversationSchema),
    onSuccess: (updatedConversation) => {
      queryClient.setQueryData(conversationKeys.detail(id), updatedConversation);
      queryClient.invalidateQueries({ queryKey: conversationKeys.lists() });
    },
  });
}

export function useCloseConversation(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post(`/conversations/${id}/close`, conversationSchema),
    onSuccess: (updatedConversation) => {
      queryClient.setQueryData(conversationKeys.detail(id), updatedConversation);
      queryClient.invalidateQueries({ queryKey: conversationKeys.lists() });
    },
  });
}
