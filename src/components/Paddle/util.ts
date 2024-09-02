import { useCurrentUser } from '~/hooks/useCurrentUser';
import { GetByIdStringInput } from '~/server/schema/base.schema';
import {
  TransactionCreateInput,
  TransactionWithSubscriptionCreateInput,
  UpdateSubscriptionInputSchema,
} from '~/server/schema/paddle.schema';
import { trpc } from '~/utils/trpc';

export const useMutatePaddle = () => {
  const processCompleteBuzzTransactionMutation =
    trpc.paddle.processCompleteBuzzTransaction.useMutation();
  const updateSubscriptionMutation = trpc.paddle.updateSubscription.useMutation();
  const cancelSubscriptionMutation = trpc.paddle.cancelSubscription.useMutation();
  const purchaseBuzzWithSubscription = trpc.paddle.purchaseBuzzWithSubscription.useMutation();
  const getOrCreateCustomerIdMutation = trpc.paddle.getOrCreateCustomer.useMutation();

  const handleProcessCompleteBuzzTransaction = (data: GetByIdStringInput) => {
    return processCompleteBuzzTransactionMutation.mutateAsync(data);
  };

  const handleUpdateSubscription = (
    data: UpdateSubscriptionInputSchema,
    opts: Parameters<typeof updateSubscriptionMutation.mutateAsync>[1]
  ) => {
    return updateSubscriptionMutation.mutateAsync(data, opts);
  };

  const handleCancelSubscriptionMutation = (
    opts: Parameters<typeof cancelSubscriptionMutation.mutateAsync>[1]
  ) => {
    return cancelSubscriptionMutation.mutateAsync(undefined, opts);
  };

  const handlePurchaseBuzzWithSubscription = (data: TransactionWithSubscriptionCreateInput) => {
    return purchaseBuzzWithSubscription.mutateAsync(data);
  };

  const handleGetOrCreateCustomer = () => {
    return getOrCreateCustomerIdMutation.mutateAsync();
  };

  return {
    processCompleteBuzzTransaction: handleProcessCompleteBuzzTransaction,
    processingCompleteBuzzTransaction: processCompleteBuzzTransactionMutation.isLoading,
    updateSubscription: handleUpdateSubscription,
    updatingSubscription: updateSubscriptionMutation.isLoading,
    cancelSubscription: handleCancelSubscriptionMutation,
    cancelingSubscription: cancelSubscriptionMutation.isLoading,
    purchaseBuzzWithSubscription: handlePurchaseBuzzWithSubscription,
    purchasingBuzzWithSubscription: purchaseBuzzWithSubscription.isLoading,
    getOrCreateCustomer: handleGetOrCreateCustomer,
    gettingOrCreateCustomer: getOrCreateCustomerIdMutation.isLoading,
  };
};

export const useSubscriptionManagementUrls = (data: { enabled?: boolean } = { enabled: true }) => {
  const currentUser = useCurrentUser();
  const { data: managementUrls, ...rest } = trpc.paddle.getManagementUrls.useQuery(undefined, {
    enabled: !!currentUser && data?.enabled,
    trpc: { context: { skipBatch: true } },
  });

  return {
    managementUrls,
    ...rest,
  };
};
