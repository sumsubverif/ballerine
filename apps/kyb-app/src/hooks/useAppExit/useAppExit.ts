import { useCustomerQuery } from '@/hooks/useCustomerQuery';
import { useFlowTracking } from '@/hooks/useFlowTracking';
import { useLanguage } from '@/hooks/useLanguage';
import { useUISchemasQuery } from '@/hooks/useUISchemasQuery';
import { useCallback } from 'react';

export const useAppExit = () => {
  const appLanguage = useLanguage();
  const { data: uiSchema } = useUISchemasQuery(appLanguage);
  const { trackExit } = useFlowTracking();
  const { customer } = useCustomerQuery();

  const kybOnExitAction = uiSchema?.config?.kybOnExitAction || 'send-event';

  const exit = useCallback(() => {
    if (kybOnExitAction === 'send-event') {
      trackExit();
      return;
    }

    if (kybOnExitAction === 'redirect-to-customer-portal') {
      if (customer?.websiteUrl) {
        location.href = customer?.websiteUrl;
      }
    }
  }, [trackExit, customer]);

  return {
    exit,
    isExitAvailable:
      uiSchema?.config?.kybOnExitAction === 'send-event' ? true : !!customer?.websiteUrl,
  };
};
