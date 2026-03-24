import { IsNotEmpty, IsString } from 'class-validator';

export class JoinCoupleDto {
  @IsString()
  @IsNotEmpty({ message: 'El código de invitación no puede estar vacío' })
  p_code!: string;
}
