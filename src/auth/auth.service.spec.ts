import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  const userId = 'user-1';

  const createService = ({
    authClient,
    dataClient,
    couplesService,
  }: {
    authClient?: {
      auth: {
        admin?: {
          listUsers?: jest.Mock;
        };
        signUp?: jest.Mock;
        signInWithPassword?: jest.Mock;
        resetPasswordForEmail?: jest.Mock;
      };
    };
    dataClient?: {
      from: jest.Mock;
    };
    couplesService?: {
      joinCouple: jest.Mock;
    };
  }) => {
    const resolvedAuthClient = authClient ?? {
      auth: {
        admin: {
          listUsers: jest.fn().mockResolvedValue({ data: { users: [] } }),
        },
        signUp: jest.fn(),
        signInWithPassword: jest.fn(),
        resetPasswordForEmail: jest.fn(),
      },
    };

    const service = new AuthService(
      {
        createPublicAuthClient: jest.fn().mockReturnValue(resolvedAuthClient),
        createAdminAuthClient: jest.fn().mockReturnValue(resolvedAuthClient),
        getClient: jest.fn().mockReturnValue(dataClient ?? { from: jest.fn() }),
      } as never,
      (couplesService ?? { joinCouple: jest.fn() }) as never,
      { logLoginFailed: jest.fn() } as never,
    );

    return { service, authClient: resolvedAuthClient };
  };

  const selectEqSingle = (data: unknown) => ({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data }),
      }),
    }),
  });

  const selectEqMaybeSingle = (data: unknown) => ({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({ data, error: null }),
      }),
    }),
  });

  const upsertResult = () => ({
    upsert: jest.fn().mockResolvedValue({ error: null }),
  });

  const updateEqResult = () => ({
    update: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    }),
  });

  const insertResult = () => ({
    insert: jest.fn().mockResolvedValue({ error: null }),
  });

  const insertSelectSingle = (data: unknown) => ({
    insert: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data, error: null }),
      }),
    }),
  });

  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('rejects registration before creating an auth user when the invite code does not exist', async () => {
    const signUp = jest.fn();
    const { service } = createService({
      authClient: {
        auth: {
          admin: {
            listUsers: jest.fn().mockResolvedValue({ data: { users: [] } }),
          },
          signUp,
        },
      },
      dataClient: {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === 'couples') return selectEqMaybeSingle(null);
          throw new Error(`Unexpected table: ${table}`);
        }),
      },
    });

    await expect(
      service.register({
        email: 'camartinezcarrasco@gmail.com',
        password: 'secret123',
        full_name: 'Camila Martinez',
        invite_code: 'CHILEZUELA',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(signUp).not.toHaveBeenCalled();
  });

  it('creates a new couple on login when stored invite metadata is invalid', async () => {
    const joinCouple = jest.fn().mockRejectedValue(
      new NotFoundException({
        code: 'INVITE_CODE_INVALID',
        message: "El código de invitación 'CHILEZUELA' no es válido",
      }),
    );
    const tableQueues: Record<string, unknown[]> = {
      profiles: [
        selectEqSingle(null),
        upsertResult(),
        selectEqSingle(null),
        upsertResult(),
        updateEqResult(),
      ],
      couples: [insertSelectSingle({ id: 'new-couple-id' })],
      family_members: [insertResult(), insertResult()],
    };
    const { service } = createService({
      authClient: {
        auth: {
          signInWithPassword: jest.fn().mockResolvedValue({
            data: {
              session: {
                access_token: 'access-token',
                refresh_token: 'refresh-token',
                expires_in: 3600,
                token_type: 'bearer',
              },
              user: {
                id: userId,
                email: 'camartinezcarrasco@gmail.com',
                email_confirmed_at: '2026-05-13T00:00:00Z',
                user_metadata: {
                  full_name: 'Camila Martinez',
                  invite_code: 'CHILEZUELA',
                },
              },
            },
            error: null,
          }),
        },
      },
      dataClient: {
        from: jest.fn().mockImplementation((table: string) => {
          const nextBuilder = tableQueues[table]?.shift();
          if (!nextBuilder) throw new Error(`Unexpected table: ${table}`);
          return nextBuilder;
        }),
      },
      couplesService: { joinCouple },
    });

    const session = await service.login({
      email: 'camartinezcarrasco@gmail.com',
      password: 'secret123',
    });

    expect(joinCouple).toHaveBeenCalledWith(userId, 'CHILEZUELA');
    expect(session.user.email).toBe('camartinezcarrasco@gmail.com');
  });

  describe('updatePassword', () => {
    const userEmail = 'usuario@ejemplo.com';
    const updateUserId = 'user-update-1';

    interface UpdatePasswordMocks {
      signInWithPassword: jest.Mock;
      updateUserById: jest.Mock;
      signOut: jest.Mock;
      logLoginFailed: jest.Mock;
    }

    const createUpdatePasswordService = (
      overrides: Partial<{
        signInWithPassword: jest.Mock;
        updateUserById: jest.Mock;
        signOut: jest.Mock;
      }> = {},
    ): { service: AuthService; mocks: UpdatePasswordMocks } => {
      const signInWithPassword =
        overrides.signInWithPassword ??
        jest.fn().mockResolvedValue({ data: {}, error: null });
      const updateUserById =
        overrides.updateUserById ??
        jest.fn().mockResolvedValue({ data: {}, error: null });
      const signOut =
        overrides.signOut ?? jest.fn().mockResolvedValue({ error: null });
      const logLoginFailed = jest.fn();

      const supabaseClient = {
        auth: {
          signInWithPassword,
          admin: {
            updateUserById,
            signOut,
          },
        },
      };

      const service = new AuthService(
        {
          createPublicAuthClient: jest.fn().mockReturnValue(supabaseClient),
          createAdminAuthClient: jest.fn().mockReturnValue(supabaseClient),
          getClient: jest.fn().mockReturnValue({ from: jest.fn() }),
        } as never,
        { joinCouple: jest.fn() } as never,
        { logLoginFailed } as never,
      );

      return {
        service,
        mocks: { signInWithPassword, updateUserById, signOut, logLoginFailed },
      };
    };

    it('throws BadRequestException when current_password equals new_password and skips reauth', async () => {
      const { service, mocks } = createUpdatePasswordService();

      await expect(
        service.updatePassword(updateUserId, userEmail, {
          current_password: 'misma-pass',
          new_password: 'misma-pass',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mocks.signInWithPassword).not.toHaveBeenCalled();
      expect(mocks.updateUserById).not.toHaveBeenCalled();
      expect(mocks.signOut).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException and logs security event when reauth fails', async () => {
      const { service, mocks } = createUpdatePasswordService({
        signInWithPassword: jest
          .fn()
          .mockResolvedValue({ data: {}, error: { message: 'invalid' } }),
      });

      await expect(
        service.updatePassword(updateUserId, userEmail, {
          current_password: 'actual',
          new_password: 'nueva',
        }),
      ).rejects.toThrow(
        new UnauthorizedException('La contraseña actual no es válida'),
      );

      expect(mocks.logLoginFailed).toHaveBeenCalledTimes(1);
      expect(mocks.logLoginFailed).toHaveBeenCalledWith(
        userEmail,
        'password_update_reauth_failed',
      );
      expect(mocks.updateUserById).not.toHaveBeenCalled();
    });

    it('throws InternalServerErrorException when admin update fails', async () => {
      const { service, mocks } = createUpdatePasswordService({
        updateUserById: jest
          .fn()
          .mockResolvedValue({ data: {}, error: { message: 'db error' } }),
      });

      await expect(
        service.updatePassword(updateUserId, userEmail, {
          current_password: 'actual',
          new_password: 'nueva',
        }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);

      expect(mocks.signOut).not.toHaveBeenCalled();
    });

    it('updates password, signs out globally and returns success message', async () => {
      const { service, mocks } = createUpdatePasswordService();

      const result = await service.updatePassword(updateUserId, userEmail, {
        current_password: 'actual',
        new_password: 'nueva',
      });

      expect(result).toEqual({
        message: 'Contraseña actualizada correctamente',
      });
      expect(mocks.updateUserById).toHaveBeenCalledWith(updateUserId, {
        password: 'nueva',
      });
      expect(mocks.signOut).toHaveBeenCalledWith(updateUserId, 'global');
    });

    it('resolves successfully when signOut fails after a successful update', async () => {
      const { service, mocks } = createUpdatePasswordService({
        signOut: jest.fn().mockResolvedValue({ error: { message: 'bad' } }),
      });

      await expect(
        service.updatePassword(updateUserId, userEmail, {
          current_password: 'actual',
          new_password: 'nueva',
        }),
      ).resolves.toEqual({ message: 'Contraseña actualizada correctamente' });

      expect(mocks.updateUserById).toHaveBeenCalledTimes(1);
      expect(mocks.signOut).toHaveBeenCalledTimes(1);
    });
  });

  it('uses CORS_ORIGIN as redirect allowlist when FRONTEND_URL is not configured', async () => {
    delete process.env['FRONTEND_URL'];
    process.env['CORS_ORIGIN'] = 'http://localhost:3001';

    const resetPasswordForEmail = jest.fn().mockResolvedValue({ error: null });
    const { service } = createService({
      authClient: {
        auth: {
          resetPasswordForEmail,
        },
      },
    });

    await service.forgotPassword({
      email: 'camartinezcarrasco@gmail.com',
      redirect_to: 'http://localhost:3001/update-password',
    });

    expect(resetPasswordForEmail).toHaveBeenCalledWith(
      'camartinezcarrasco@gmail.com',
      { redirectTo: 'http://localhost:3001/update-password' },
    );
  });
});
