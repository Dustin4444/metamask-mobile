import { createSelector } from 'reselect';
import { selectRemoteFeatureFlags } from '..';
import { validatedVersionGatedFeatureFlag } from '../../../util/remoteFeatureFlag';

interface MoneyAccountFeatureFlag {
  moneyAccountDepositEnabled?: boolean;
  moneyAccountWithdrawEnabled?: boolean;
}

export const selectMoneyAccountDepositEnabledFlag = createSelector(
  selectRemoteFeatureFlags,
  (remoteFeatureFlags) => {
    const flag =
      remoteFeatureFlags?.moneyAccount as unknown as MoneyAccountFeatureFlag;
    return flag?.moneyAccountDepositEnabled ?? false;
  },
);

export const selectMoneyAccountWithdrawEnabledFlag = createSelector(
  selectRemoteFeatureFlags,
  (remoteFeatureFlags) => {
    const flag =
      remoteFeatureFlags?.moneyAccount as unknown as MoneyAccountFeatureFlag;
    return flag?.moneyAccountWithdrawEnabled ?? false;
  },
);

export interface MoneyAccountVaultConfig {
  chainId: string;
  boringVault: string;
  tellerAddress: string;
  accountantAddress: string;
  lensAddress: string;
}

export const DEV_VAULT_CONFIG: MoneyAccountVaultConfig = {
  chainId: '0xa4b1',
  boringVault: '0xB5F07d769dD60fE54c97dd53101181073DDf21b2',
  tellerAddress: '0x86821F179eaD9F0b3C79b2f8deF0227eEBFDc9f9',
  accountantAddress: '0x800ebc3B74F67EaC27C9CCE4E4FF28b17CdCA173',
  lensAddress: '0x846a7832022350434B5cC006d07cc9c782469660',
};

/**
 * Selects whether the money account address display is enabled.
 * This is a version-gated feature flag that shows the money account address
 * (with copy and block explorer buttons) in the "Add..." bottom sheet
 * instead of the "Coming soon" placeholder.
 */
export const selectMoneyShowMoneyAccountAddress = createSelector(
  selectRemoteFeatureFlags,
  (remoteFeatureFlags) => {
    const remoteFlag = remoteFeatureFlags?.moneyShowMoneyAccountAddress;
    return validatedVersionGatedFeatureFlag(remoteFlag) ?? false;
  },
);

export const selectMoneyAccountVaultConfig = createSelector(
  selectRemoteFeatureFlags,
  (remoteFeatureFlags): MoneyAccountVaultConfig | undefined => {
    const remoteConfig =
      remoteFeatureFlags?.moneyAccountVaultConfig as unknown as
        | MoneyAccountVaultConfig
        | undefined;
    if (remoteConfig) {
      return remoteConfig;
    }
    const devFallbackEnabled =
      process.env.MM_MONEY_DEPOSIT_CONFIG_DEV_ENABLED === 'true';
    return devFallbackEnabled ? DEV_VAULT_CONFIG : undefined;
  },
);
