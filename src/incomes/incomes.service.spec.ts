import { BadRequestException } from '@nestjs/common';
import { IncomesService } from './incomes.service';

describe('IncomesService', () => {
  it('rejects incomes assigned to an unlinked placeholder member', async () => {
    const db = {
      insert: jest.fn(),
    };
    const coupleContextService = {
      assertFamilyMemberIsLinked: jest.fn().mockRejectedValue(
        new BadRequestException({
          code: 'FAMILY_MEMBER_NOT_LINKED',
          message:
            'No puedes asignar ingresos a una pareja que todavía no está vinculada.',
        }),
      ),
    };
    const service = new IncomesService(
      db as never,
      coupleContextService as never,
    );

    await expect(
      service.createIncome('couple-1', 'auth-user-1', {
        id: '9b5b9855-66e0-4112-a39a-b8504f279958',
        user_id: 'member-placeholder',
        amount: 1500000,
        description: 'Sueldo',
        date: '2026-05-13T12:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.insert).not.toHaveBeenCalled();
  });
});
