import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { DRIZZLE } from '../database/database.module.js';
import { CoupleContextService } from '../common/services/couple-context.service.js';

describe('ExpensesService', () => {
  let service: ExpensesService;

  type SplitCalculator = {
    calculateScopedExpenseAmount: (
      expense: {
        amount: number;
        isCredit: boolean;
        splitMethod: '50/50' | 'proportional' | 'individual';
        assignedToRef: string | null;
      },
      scope: 'couple' | 'current_user',
      currentMemberRef: string | null,
      splitRatios: Map<string, number>,
      equalSplitDivisor: number,
    ) => number;
    getEqualSplitDivisor: (memberCount: number) => number;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        { provide: DRIZZLE, useValue: {} },
        {
          provide: CoupleContextService,
          useValue: {
            assertOptionalFamilyMemberBelongsToCouple: jest.fn(),
            assertOptionalBudgetBelongsToCouple: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ExpensesService>(ExpensesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('uses two people as the minimum divisor for 50/50 expenses', () => {
    const calculator = service as unknown as SplitCalculator;
    const amount = calculator.calculateScopedExpenseAmount(
      {
        amount: 9000,
        isCredit: false,
        splitMethod: '50/50',
        assignedToRef: null,
      },
      'current_user',
      'member_1',
      new Map(),
      calculator.getEqualSplitDivisor(1),
    );

    expect(amount).toBe(4500);
  });

  it('divides 50/50 expenses by the real member count when data has three members', () => {
    const calculator = service as unknown as SplitCalculator;
    const amount = calculator.calculateScopedExpenseAmount(
      {
        amount: 9000,
        isCredit: false,
        splitMethod: '50/50',
        assignedToRef: null,
      },
      'current_user',
      'member_1',
      new Map(),
      calculator.getEqualSplitDivisor(3),
    );

    expect(amount).toBe(3000);
  });

  it('uses the equal split fallback for proportional expenses without income', () => {
    const calculator = service as unknown as SplitCalculator;
    const amount = calculator.calculateScopedExpenseAmount(
      {
        amount: 9000,
        isCredit: false,
        splitMethod: 'proportional',
        assignedToRef: null,
      },
      'current_user',
      'member_1',
      new Map(),
      calculator.getEqualSplitDivisor(3),
    );

    expect(amount).toBe(3000);
  });

  it('rejects shared expenses when the couple has no linked partner', async () => {
    const db = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            { id: 'member-1', linkedUserId: 'auth-user-1' },
            { id: 'member-placeholder', linkedUserId: null },
          ]),
        }),
      }),
      insert: jest.fn(),
    };
    const context = {
      assertOptionalFamilyMemberBelongsToCouple: jest
        .fn()
        .mockResolvedValue(undefined),
      assertOptionalBudgetBelongsToCouple: jest
        .fn()
        .mockResolvedValue(undefined),
    };
    const guardedService = new ExpensesService(db as never, context as never);

    await expect(
      guardedService.addExpense('couple-1', 'auth-user-1', {
        p_expense_id: '9b5b9855-66e0-4112-a39a-b8504f279958',
        p_amount: 12000,
        p_date: '2026-05-13T12:00:00.000Z',
        p_description: 'Supermercado',
        p_is_recurring: false,
        p_paid_by: 'member-1',
        p_split_method: '50/50',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('rejects expenses paid by an unlinked placeholder member', async () => {
    const db = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest
            .fn()
            .mockResolvedValue([
              { id: 'member-placeholder', linkedUserId: null },
            ]),
        }),
      }),
      insert: jest.fn(),
    };
    const context = {
      assertOptionalFamilyMemberBelongsToCouple: jest
        .fn()
        .mockResolvedValue(undefined),
      assertOptionalBudgetBelongsToCouple: jest
        .fn()
        .mockResolvedValue(undefined),
    };
    const guardedService = new ExpensesService(db as never, context as never);

    await expect(
      guardedService.addExpense('couple-1', 'auth-user-1', {
        p_expense_id: '9b5b9855-66e0-4112-a39a-b8504f279958',
        p_amount: 12000,
        p_date: '2026-05-13T12:00:00.000Z',
        p_description: 'Supermercado',
        p_is_recurring: false,
        p_paid_by: 'member-placeholder',
        p_assigned_user_id: 'member-placeholder',
        p_split_method: 'individual',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.insert).not.toHaveBeenCalled();
  });
});
