import { IsEmail, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

export class SendInviteDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'El email del receptor no es válido' })
  @IsNotEmpty({ message: 'El email del receptor no puede estar vacío' })
  receiver_email!: string;
}
