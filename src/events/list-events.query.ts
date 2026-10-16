import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListEventsQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
