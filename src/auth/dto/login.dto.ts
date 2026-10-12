import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'ada@example.com' })
  email: string;

  @ApiProperty()
  password: string;
}
