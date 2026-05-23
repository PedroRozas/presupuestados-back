import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

const ALLOWED_SPLIT_METHODS = ['50/50', 'proportional', 'individual'] as const;

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  full_name?: string;

  @IsOptional()
  @IsUrl(
    { protocols: ['https'], require_protocol: true },
    { message: 'avatar_url debe ser una URL https válida' },
  )
  @MaxLength(2048)
  avatar_url?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s()-]{6,20}$/, {
    message:
      'phone debe tener entre 6 y 20 caracteres y solo dígitos, +, espacios, paréntesis o guiones',
  })
  phone?: string;

  @IsOptional()
  @IsIn(ALLOWED_SPLIT_METHODS, {
    message: 'default_split_method inválido',
  })
  default_split_method?: (typeof ALLOWED_SPLIT_METHODS)[number];

  @IsOptional()
  @IsBoolean()
  has_seen_onboarding?: boolean;
}
