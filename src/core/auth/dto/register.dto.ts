
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';


export class RegisterDto {
    @IsString()
    @IsNotEmpty()
    @MinLength(6)
    @MaxLength(20)
    username: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(6)
    @MaxLength(20)
    password: string;
}
