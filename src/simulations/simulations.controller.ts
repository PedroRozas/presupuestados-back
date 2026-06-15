import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common'
import { Request } from 'express'
import { AuthGuard, AuthenticatedUser } from '../common/guards/auth.guard.js'
import { CoupleContextService } from '../common/services/couple-context.service.js'
import { SimulationsService } from './simulations.service.js'
import { ApplySimulationDto } from './dto/apply-simulation.dto.js'

@Controller('simulations')
@UseGuards(AuthGuard)
export class SimulationsController {
  constructor(
    private readonly simulationsService: SimulationsService,
    private readonly coupleContextService: CoupleContextService,
  ) {}

  @Post('apply')
  async apply(
    @Body() dto: ApplySimulationDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    const ownerId = req.user.id
    const coupleId = await this.coupleContextService.getCoupleIdOrThrow(
      ownerId,
      {
        profileError: 'Error fetching user profile',
        missingCoupleError: 'User is not part of a couple',
      },
    )
    return this.simulationsService.apply(coupleId, ownerId, dto)
  }
}
