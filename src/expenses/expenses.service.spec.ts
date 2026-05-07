import { Test, TestingModule } from '@nestjs/testing';
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
});
