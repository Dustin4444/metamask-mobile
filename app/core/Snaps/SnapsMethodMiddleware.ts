///: BEGIN:ONLY_INCLUDE_IF(snaps)
import { createSnapsMethodMiddleware } from '@metamask/snaps-rpc-methods';
import {
  RequestedPermissions,
  SubjectType,
} from '@metamask/permission-controller';
import { SnapRpcHookArgs } from '@metamask/snaps-utils';
import { RestrictedMethods } from '../Permissions/constants';
import { keyringSnapPermissionsBuilder } from '../SnapKeyring/keyringSnapsPermissions';
import { SnapId } from '@metamask/snaps-sdk';
import { RootExtendedMessenger, EngineContext } from '../Engine';
import { handleSnapRequest } from './utils';
import { captureException } from '@sentry/react-native';
import {
  CronjobControllerCancelAction,
  CronjobControllerGetAction,
  SnapControllerClearSnapStateAction,
  SnapControllerGetPermittedSnapsAction,
  SnapControllerGetSnapAction,
  SnapControllerGetSnapFileAction,
  SnapControllerGetSnapStateAction,
  SnapControllerInstallSnapsAction,
  SnapControllerUpdateSnapStateAction,
  SnapInterfaceControllerCreateInterfaceAction,
  SnapInterfaceControllerResolveInterfaceAction,
  SnapInterfaceControllerUpdateInterfaceAction,
  SnapInterfaceControllerUpdateInterfaceStateAction,
  WebSocketServiceOpenAction,
  WebSocketServiceCloseAction,
  WebSocketServiceGetAllAction,
  WebSocketServiceSendMessageAction,
} from '../Engine/controllers/snaps/constants';
import { KeyringTypes } from '@metamask/keyring-controller';
import { analytics } from '../../util/analytics/analytics';
import { AnalyticsEventBuilder } from '../../util/analytics/AnalyticsEventBuilder';
import { Json } from '@metamask/utils';
import { CronjobControllerScheduleAction } from '@metamask/snaps-controllers';
import { endTrace, trace } from '../../util/trace';
import { AppState } from 'react-native';
import { getVersion } from 'react-native-device-info';

export const trackSnapEvent = (eventPayload: {
  event: string;
  properties: Record<string, Json>;
  sensitiveProperties: Record<string, Json>;
}) => {
  analytics.trackEvent(
    AnalyticsEventBuilder.createEventBuilder(eventPayload.event)
      .addProperties(eventPayload.properties)
      .addSensitiveProperties(eventPayload.sensitiveProperties)
      .build(),
  );
};

export function getSnapIdFromRequest(
  request: Record<string, unknown>,
): SnapId | null {
  const { snapId } = request;
  return typeof snapId === 'string' ? (snapId as SnapId) : null;
}
// Snaps middleware
/*
    from extension https://github.dev/MetaMask/metamask-extension/blob/1d5e8a78400d7aaaf2b3cbdb30cff9399061df34/app/scripts/metamask-controller.js#L3830-L3861
    */
const snapMethodMiddlewareBuilder = (
  engineContext: EngineContext,
  controllerMessenger: RootExtendedMessenger,
  origin: string,
  subjectType: SubjectType,
) => {
  // The messenger 1.2 typings overload `.call`'s `this` per action, which makes
  // partial application via `.bind` reject under strict checking. This helper
  // re-applies the call with the same `this` for the tightly-typed pre-bound
  // callbacks below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const callMessenger = ((...args: any[]) =>
    (
      controllerMessenger.call as (
        ...callArgs: unknown[]
      ) => unknown
    )(...args)) as typeof controllerMessenger.call;
  return createSnapsMethodMiddleware(subjectType === SubjectType.Snap, {
    getUnlockPromise: () => {
      if (engineContext.KeyringController.isUnlocked()) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        controllerMessenger.subscribeOnceIf(
          'KeyringController:unlock',
          resolve,
          () => true,
        );
      });
    },
    getSnaps: callMessenger.bind(undefined,
      SnapControllerGetPermittedSnapsAction,
      origin,
    ),
    requestPermissions: async (requestedPermissions: RequestedPermissions) =>
      await engineContext.PermissionController.requestPermissions(
        { origin },
        requestedPermissions,
      ),
    getPermissions: engineContext.PermissionController.getPermissions.bind(
      engineContext.PermissionController,
      origin,
    ),
    hasPermission: engineContext.PermissionController.hasPermission.bind(
      engineContext.PermissionController,
      origin,
    ),
    getAllowedKeyringMethods: keyringSnapPermissionsBuilder(origin),
    getSnapFile: callMessenger.bind(undefined,
      SnapControllerGetSnapFileAction,
      origin as SnapId,
    ),
    installSnaps: callMessenger.bind(undefined,
      SnapControllerInstallSnapsAction,
      origin,
    ),
    invokeSnap: engineContext.PermissionController.executeRestrictedMethod.bind(
      engineContext.PermissionController,
      origin,
      RestrictedMethods.wallet_snap,
    ),
    createInterface: callMessenger.bind(undefined,
      SnapInterfaceControllerCreateInterfaceAction,
      origin as SnapId,
    ),
    updateInterface: callMessenger.bind(undefined,
      SnapInterfaceControllerUpdateInterfaceAction,
      origin as SnapId,
    ),
    getInterfaceContext: (id: string) =>
      controllerMessenger.call(
        'SnapInterfaceController:getInterface',
        origin as SnapId,
        id,
      ).context,
    getInterfaceState: (id: string) =>
      controllerMessenger.call(
        'SnapInterfaceController:getInterfaceState',
        origin as SnapId,
        id,
      ),
    resolveInterface: callMessenger.bind(undefined,
      SnapInterfaceControllerResolveInterfaceAction,
      origin as SnapId,
    ),
    getSnap: callMessenger.bind(undefined,
      SnapControllerGetSnapAction,
    ),
    trackError: (error: Error) => captureException(error),
    trackEvent: trackSnapEvent,
    openWebSocket: callMessenger.bind(undefined,
      WebSocketServiceOpenAction,
      origin as SnapId,
    ),
    closeWebSocket: callMessenger.bind(undefined,
      WebSocketServiceCloseAction,
      origin as SnapId,
    ),
    sendWebSocketMessage: callMessenger.bind(undefined,
      WebSocketServiceSendMessageAction,
      origin as SnapId,
    ),
    getWebSockets: callMessenger.bind(undefined,
      WebSocketServiceGetAllAction,
      origin as SnapId,
    ),
    updateInterfaceState: callMessenger.bind(undefined,
      SnapInterfaceControllerUpdateInterfaceStateAction,
      origin as SnapId,
    ),
    handleSnapRpcRequest: async (request: Omit<SnapRpcHookArgs, 'origin'>) => {
      const snapId = getSnapIdFromRequest(request);

      if (!snapId) {
        throw new Error(
          'snapMethodMiddlewareBuilder handleSnapRpcRequest: Invalid snap request: snapId not found',
        );
      }

      return await handleSnapRequest(controllerMessenger, {
        snapId,
        origin,
        handler: request.handler,
        request: request.request,
      });
    },
    requestUserApproval:
      engineContext.ApprovalController.addAndShowApprovalRequest.bind(
        engineContext.ApprovalController,
      ),
    getIsActive: () =>
      AppState.currentState === 'active' &&
      engineContext.KeyringController.isUnlocked(),
    getIsLocked: () => !engineContext.KeyringController.isUnlocked(),
    getVersion: () => {
      const baseVersion = getVersion();
      const buildType = process.env.METAMASK_BUILD_TYPE;

      if (buildType === 'main' || buildType === 'qa') {
        return baseVersion;
      }

      return `${baseVersion}-${buildType}.0`;
    },
    getEntropySources: () => {
      const state = controllerMessenger.call('KeyringController:getState');

      return state.keyrings
        .map((keyring, index) => {
          if (keyring.type === KeyringTypes.hd) {
            return {
              id: keyring.metadata.id,
              name: keyring.metadata.name,
              type: 'mnemonic',
              primary: index === 0,
            };
          }

          return null;
        })
        .filter(Boolean);
    },
    clearSnapState: callMessenger.bind(undefined,
      SnapControllerClearSnapStateAction,
      origin as SnapId,
    ),
    getSnapState: callMessenger.bind(undefined,
      SnapControllerGetSnapStateAction,
      origin as SnapId,
    ),
    updateSnapState: callMessenger.bind(undefined,
      SnapControllerUpdateSnapStateAction,
      origin as SnapId,
    ),
    scheduleBackgroundEvent: (
      event: Parameters<CronjobControllerScheduleAction['handler']>[0],
    ) =>
      controllerMessenger.call('CronjobController:schedule', {
        ...event,
        snapId: origin as SnapId,
      }),
    cancelBackgroundEvent: callMessenger.bind(undefined,
      CronjobControllerCancelAction,
      origin as SnapId,
    ),
    getBackgroundEvents: callMessenger.bind(undefined,
      CronjobControllerGetAction,
      origin as SnapId,
    ),
    getNetworkConfigurationByChainId: callMessenger.bind(undefined,
      'NetworkController:getNetworkConfigurationByChainId',
    ),
    getNetworkClientById: callMessenger.bind(
      undefined,
      'NetworkController:getNetworkClientById',
    ),
    startTrace: trace,
    endTrace,
  });
};

export default snapMethodMiddlewareBuilder;
///: END:ONLY_INCLUDE_IF
