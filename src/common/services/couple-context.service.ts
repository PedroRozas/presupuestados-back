import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service.js';

interface CoupleContextMessages {
  profileError?: string;
  missingCoupleError?: string;
}

@Injectable()
export class CoupleContextService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getCoupleIdOrThrow(
    userId: string,
    messages?: CoupleContextMessages,
  ): Promise<string> {
    const { data: profile, error } = await this.supabaseService
      .getClient()
      .from('profiles')
      .select('couple_id')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      throw new InternalServerErrorException(
        messages?.profileError ?? 'Error al obtener el perfil',
      );
    }

    if (!profile.couple_id) {
      throw new NotFoundException(
        messages?.missingCoupleError ?? 'El usuario no pertenece a una pareja',
      );
    }

    return profile.couple_id;
  }
}
