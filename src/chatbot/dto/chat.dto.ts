import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsIn,
  ValidateNested,
  IsOptional,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ChatMessageDto {
  @IsString()
  @IsIn(['user', 'model'])
  role!: 'user' | 'model';

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text!: string;
}

export class ChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  history?: ChatMessageDto[];
}
