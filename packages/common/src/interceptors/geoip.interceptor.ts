import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  HttpStatus,
  InternalServerErrorException,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import axios from 'axios';

@Injectable()
export class GeoIPInterceptor implements NestInterceptor {
  private readonly httpService: HttpService;
  private readonly allowedCountries: string[];
  private readonly configService: ConfigService;
  private readonly logger : Logger;
  private readonly accessDeniedMessage: string;
  private readonly accessDeniedStatus: number;
  
  constructor(allowedCountries: string[], accessDeniedStatus: number = HttpStatus.FORBIDDEN) {
    this.logger = new Logger('GeoIPInterceptor');
    this.httpService = new HttpService();
    this.allowedCountries = allowedCountries;
    this.configService = new ConfigService();
    this.accessDeniedMessage = 'Access Denied'; 
    this.accessDeniedStatus = accessDeniedStatus;
  }

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();

    // Log all headers to see what is being received
    this.logger.log('Request Headers:', request.headers);

    const clientIp =
      request.headers['ip'] ||
      request.ip ||
      request.headers['x-forwarded-for'];

    this.logger.verbose('Using IP address for geolocation:', clientIp);

    try {
      const { country, regionName } = await this.getLocation(clientIp);
      if (
        this.allowedCountries.length > 0 &&
        !this.allowedCountries.includes(country)
      ) {
        this.logger.error(
          'Denying request from IP: ' + clientIp + ' country: ' + country,
        );
        throw new HttpException(
          this.accessDeniedMessage,
          this.accessDeniedStatus
        );
      }

      this.logger.log(
        'Allowed request from IP: ' + clientIp + ' region: ' + regionName,
      );
    } catch (err) {
      if (err instanceof HttpException) {
        this.logger.error(
          `HttpException: ${err.message} with status code: ${err.getStatus()}`
        );
      } else {
        this.logger.error('Unexpected error: ', err.message);
        throw new InternalServerErrorException(
          'Error occurred while reading the geoip database',
        );
      }
    }
    return next.handle();
  }

  private async getLocation(ip: string): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.get(
        `http://geoip.samagra.io/city/${ip}`,
      );
      return response.data; 
    } catch (err) {
      throw new InternalServerErrorException(
        'Error occurred while reading the geoip database',
      );
    }
  }
}
