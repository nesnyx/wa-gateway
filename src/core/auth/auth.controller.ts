import { Controller, Get, Post, Body, Req, UseGuards, } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return await this.authService.login(loginDto);
  }


  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return await this.authService.register(registerDto.username, registerDto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@Req() req) {
    return req.user;
  }

}
