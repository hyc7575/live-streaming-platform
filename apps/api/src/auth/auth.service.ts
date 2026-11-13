import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/database.module.js';
import { authUserSelect, toAuthUser, type AuthUser } from './auth-user.js';
import { hashPassword, verifyPassword } from './password.js';

export interface SignupInput {
  email: string;
  password: string;
  nickname: string;
}

export interface Credentials {
  email: string;
  password: string;
}

@Injectable()
export class AuthService {
  // 이메일을 모를 때 대신 비교하는 값. 그래서 없는 계정도 비밀번호가 틀린 경우와
  // 같은 시간이 걸리고, 응답 시간으로 계정 존재가 드러나지 않는다.
  private readonly decoyHash = hashPassword('decoy-password');

  constructor(private readonly prisma: PrismaService) {}

  async signup(input: SignupInput): Promise<AuthUser> {
    const passwordHash = await hashPassword(input.password);
    try {
      return toAuthUser(
        await this.prisma.user.create({
          data: { email: input.email, nickname: input.nickname, passwordHash },
          select: authUserSelect,
        }),
      );
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Email is already registered');
      }
      throw err;
    }
  }

  async verifyCredentials(credentials: Credentials): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: credentials.email },
      select: { ...authUserSelect, passwordHash: true },
    });
    if (!user) {
      await verifyPassword(credentials.password, await this.decoyHash);
      return null;
    }
    const { passwordHash, ...row } = user;
    return (await verifyPassword(credentials.password, passwordHash))
      ? toAuthUser(row)
      : null;
  }
}
