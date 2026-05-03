import { Test, TestingModule } from '@nestjs/testing';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service.js';
import { CoupleContextService } from '../common/services/couple-context.service.js';
import { SupabaseService } from '../supabase/supabase.service.js';

describe('ExpensesController', () => {
  let controller: ExpensesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExpensesController],
      providers: [
        {
          provide: ExpensesService,
          useValue: {
            listExpenses: jest.fn(),
            addExpense: jest.fn(),
            updateExpense: jest.fn(),
            updateRecurringExpense: jest.fn(),
            stopRecurringExpense: jest.fn(),
            deleteExpensesBatch: jest.fn(),
            deleteExpense: jest.fn(),
          },
        },
        {
          provide: CoupleContextService,
          useValue: {
            getCoupleIdOrThrow: jest.fn(),
          },
        },
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ExpensesController>(ExpensesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
