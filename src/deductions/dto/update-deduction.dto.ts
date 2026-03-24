import { PartialType } from '@nestjs/mapped-types';
import { CreateDeductionDto } from './create-deduction.dto.js';

export class UpdateDeductionDto extends PartialType(CreateDeductionDto) {}
