import { Test, TestingModule } from '@nestjs/testing';
import { ExpensesService } from './expenses.service';
import { DRIZZLE } from '../database/database.module.js';
import { CoupleContextService } from '../common/services/couple-context.service.js';

describe('ExpensesService', () => {
  let service: ExpensesService;

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
});
