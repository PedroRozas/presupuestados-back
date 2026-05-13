import { BadRequestException } from '@nestjs/common';
import { DeductionsService } from './deductions.service';

describe('DeductionsService', () => {
  it('rejects deductions assigned to an unlinked placeholder member', async () => {
    const db = {
      insert: jest.fn(),
    };
    const coupleContextService = {
      assertFamilyMemberIsLinked: jest.fn().mockRejectedValue(
        new BadRequestException({
          code: 'FAMILY_MEMBER_NOT_LINKED',
          message:
            'No puedes asignar deducciones a una pareja que todavía no está vinculada.',
        }),
      ),
    };
    const service = new DeductionsService(
      db as never,
      coupleContextService as never,
    );

    await expect(
      service.createDeduction('couple-1', 'auth-user-1', {
        id: '9b5b9855-66e0-4112-a39a-b8504f279958',
        user_id: 'member-placeholder',
        amount: 150000,
        description: 'Descuento',
        date: '2026-05-13T12:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.insert).not.toHaveBeenCalled();
  });
});
