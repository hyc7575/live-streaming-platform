import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  authUserSelect,
  toAuthUser,
  type AuthUser,
} from '../auth/auth-user.js';
import {
  isTestAccount,
  TEST_ACCOUNTS_CONFIG,
  type TestAccountsConfig,
} from '../auth/test-accounts.js';
import { PrismaService } from '../database/database.module.js';

export const TEST_ACCOUNT_NICKNAME_MESSAGE =
  '테스트 계정은 닉네임을 바꿀 수 없습니다.';

export interface ProfileInput {
  nickname?: string;
  bio?: string;
}

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TEST_ACCOUNTS_CONFIG)
    private readonly testAccounts: TestAccountsConfig,
  ) {}

  // 테스트 계정도 자기 닉네임은 다시 보낼 수 있다. 그래야 한 폼에서
  // 소개만 저장할 수 있다. 다른 닉네임만 거부한다.
  async update(user: AuthUser, input: ProfileInput): Promise<AuthUser> {
    if (
      input.nickname !== undefined &&
      input.nickname !== user.nickname &&
      isTestAccount(this.testAccounts, user.email)
    ) {
      throw new ForbiddenException(TEST_ACCOUNT_NICKNAME_MESSAGE);
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: input,
      select: authUserSelect,
    });
    return toAuthUser(updated);
  }
}
