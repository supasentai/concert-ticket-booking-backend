import { ApiProperty } from '@nestjs/swagger';
import { TokenPairDto } from './token-pair.dto';
import { UserResponseDto } from '../../users/dto/user-response.dto';

export class AuthResponseDto {
  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;

  @ApiProperty({ type: TokenPairDto })
  tokens: TokenPairDto;
}
