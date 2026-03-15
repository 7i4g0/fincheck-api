import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { IsPublic } from '../../shared/decorators/IsPublic';
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_COOKIE_OPTIONS,
  getCookieOptionsForProxy,
} from './auth.constants';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SigninDto } from './dto/signin.dto';
import { SignupDto } from './dto/signup.dto';
import { PasswordResetService } from './services/password-reset.service';

function getCookieOptions(req: Request) {
  const forwardedHost =
    (req.headers['x-forwarded-host'] as string | undefined)
      ?.split(',')[0]
      ?.trim() || process.env.FRONTEND_COOKIE_DOMAIN;
  if (forwardedHost) {
    return getCookieOptionsForProxy(forwardedHost);
  }
  return ACCESS_TOKEN_COOKIE_OPTIONS;
}

@IsPublic()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  @Post('signin')
  async signin(
    @Body() signinDto: SigninDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken } = await this.authService.signin(signinDto);
    const options = getCookieOptions(req);
    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, options);
    return { success: true };
  }

  @Post('signup')
  async signup(
    @Body() signupDto: SignupDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken } = await this.authService.signup(signupDto);
    const options = getCookieOptions(req);
    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, options);
    return { success: true };
  }

  @Post('signout')
  signout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const options = getCookieOptions(req);
    const clearOptions: {
      path: string;
      httpOnly: boolean;
      secure: boolean;
      sameSite: 'lax' | 'none';
      domain?: string;
    } = {
      path: '/',
      httpOnly: true,
      secure: options.secure,
      sameSite: options.sameSite,
    };
    if ('domain' in options && options.domain) {
      clearOptions.domain = options.domain;
    }
    res.clearCookie(ACCESS_TOKEN_COOKIE, clearOptions);
    return { success: true };
  }

  @Post('forgot-password')
  forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.passwordResetService.requestPasswordReset(forgotPasswordDto);
  }

  @Get('validate-reset-token')
  validateResetToken(@Query('token') token: string) {
    return this.passwordResetService.validateToken(token);
  }

  @Post('reset-password')
  resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.passwordResetService.resetPassword(resetPasswordDto);
  }

  /**
   * Debug: check if auth cookie arrived at API (does not expose the token).
   * Remove or restrict in production if you want.
   */
  @Get('debug-session')
  debugSession(@Req() req: Request) {
    const cookiePresent = !!req.cookies?.[ACCESS_TOKEN_COOKIE];
    return {
      cookieSent: cookiePresent,
      hint: cookiePresent
        ? 'Cookie chegou na API. Se /users/me ainda falha, o JWT pode estar inválido ou expirado.'
        : 'Cookie NÃO chegou. Verifique: same domain/subdomain, Secure, SameSite, withCredentials.',
    };
  }
}
