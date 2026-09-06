import { IsString, Length } from 'class-validator';

const MIN_MESSAGE_LENGTH = 2;
const MAX_MESSAGE_LENGTH = 500;

export class QueryDto {
  @IsString()
  @Length(MIN_MESSAGE_LENGTH, MAX_MESSAGE_LENGTH)
  message!: string;
}
