import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../../generated/prisma/enums';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };

  const createContext = (role: Role): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            id: 'user-id',
            email: 'user@example.com',
            role,
          },
        }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows the required role', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.OPERATOR]);
    const guard = new RolesGuard(reflector as unknown as Reflector);

    expect(guard.canActivate(createContext(Role.OPERATOR))).toBe(true);
  });

  it('rejects an insufficient role', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.OPERATOR]);
    const guard = new RolesGuard(reflector as unknown as Reflector);

    expect(guard.canActivate(createContext(Role.CUSTOMER))).toBe(false);
  });
});
