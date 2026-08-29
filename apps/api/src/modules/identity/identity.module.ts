import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_CONFIG, type AppConfig } from '../../config/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { EmailService } from './email.service';
import { TotpService } from './totp.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.JWT_SECRET,
        signOptions: { expiresIn: config.ACCESS_TOKEN_TTL_SECONDS, issuer: 'messa' },
        verifyOptions: { issuer: 'messa' },
      }),
    }),
  ],
  controllers: [AuthController, MembersController],
  providers: [AuthService, MembersService, EmailService, TotpService],
  exports: [AuthService, JwtModule],
})
export class IdentityModule {}
