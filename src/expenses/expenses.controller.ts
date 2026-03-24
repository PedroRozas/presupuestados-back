import {
  Controller,
  Post,
  Get,
  Body,
  Put,
  Param,
  Delete,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, AuthenticatedUser } from '../common/guards/auth.guard.js';
import { ExpensesService } from './expenses.service.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { UpdateExpenseDto } from './dto/update-expense.dto.js';
import { UpdateRecurringExpenseDto } from './dto/update-recurring-expense.dto.js';
import { StopRecurringExpenseDto } from './dto/stop-recurring-expense.dto.js';
import { DeleteExpensesBatchDto } from './dto/delete-expenses-batch.dto.js';
import { CoupleContextService } from '../common/services/couple-context.service.js';

@Controller('expenses')
@UseGuards(AuthGuard)
export class ExpensesController {
  constructor(
    private readonly expensesService: ExpensesService,
    private readonly coupleContextService: CoupleContextService,
  ) {}

  @Get()
  async listExpenses(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const coupleId = await this.coupleContextService.getCoupleIdOrThrow(
      req.user.id,
      {
        profileError: 'Error fetching user profile',
        missingCoupleError: 'User is not part of a couple',
      },
    );
    const parsedMonth = month ? parseInt(month, 10) : undefined;
    const parsedYear = year ? parseInt(year, 10) : undefined;
    return this.expensesService.listExpenses(coupleId, parsedMonth, parsedYear);
  }

  @Post()
  async addExpense(
    @Body() createExpenseDto: CreateExpenseDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    const ownerId = req.user.id;
    const coupleId = await this.coupleContextService.getCoupleIdOrThrow(
      ownerId,
      {
        profileError: 'Error fetching user profile',
        missingCoupleError: 'User is not part of a couple',
      },
    );
    return this.expensesService.addExpense(coupleId, ownerId, createExpenseDto);
  }

  @Put(':id')
  async updateExpense(
    @Param('id') id: string,
    @Body() updateExpenseDto: UpdateExpenseDto,
  ) {
    // Injecting ID to the DTO for consistency with the service method
    updateExpenseDto.p_expense_id = id;
    // Only updates existing, ownerId/coupleId not required strictly if we just trust the id,
    // or we can add Row Level Security / validation. Since RLS is bypassed by service role if using that,
    // we should ideally validate ownership. But for now matching the implementation_plan mapping.
    return this.expensesService.updateExpense(updateExpenseDto);
  }

  @Put('recurring/:id')
  async updateRecurringExpense(
    @Param('id') id: string,
    @Body() updateRecurringDto: UpdateRecurringExpenseDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    // Inject ID into DTO
    updateRecurringDto.p_old_expense_id = id;
    const ownerId = req.user.id;
    return this.expensesService.updateRecurringExpense(
      ownerId,
      updateRecurringDto,
    );
  }

  @Put('recurring/:id/stop')
  async stopRecurringExpense(
    @Param('id') id: string,
    @Body() stopRecurringDto: StopRecurringExpenseDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    // Inject ID
    stopRecurringDto.p_expense_id = id;
    const ownerId = req.user.id;
    const coupleId = await this.coupleContextService.getCoupleIdOrThrow(
      ownerId,
      {
        profileError: 'Error fetching user profile',
        missingCoupleError: 'User is not part of a couple',
      },
    );
    return this.expensesService.stopRecurringExpense(
      coupleId,
      stopRecurringDto,
    );
  }

  @Delete('batch')
  async deleteExpensesBatch(
    @Body() deleteBatchDto: DeleteExpensesBatchDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    const ownerId = req.user.id;
    const coupleId = await this.coupleContextService.getCoupleIdOrThrow(
      ownerId,
      {
        profileError: 'Error fetching user profile',
        missingCoupleError: 'User is not part of a couple',
      },
    );
    return this.expensesService.deleteExpensesBatch(coupleId, deleteBatchDto);
  }

  @Delete(':id')
  async deleteExpense(
    @Param('id') id: string,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    const coupleId = await this.coupleContextService.getCoupleIdOrThrow(
      req.user.id,
      {
        profileError: 'Error fetching user profile',
        missingCoupleError: 'User is not part of a couple',
      },
    );
    return this.expensesService.deleteExpense(coupleId, id);
  }
}
