import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AppInitService } from 'src/app/app-init.service';
import { SessionService } from 'src/app/main/services/session.service';

export interface UploadedFile {
    fileType: string;
    internalFilename: string;
    originalFilename: string;
    temporaryUrl: string;
}

export interface UploadedFileResponse {
    uploadedFiles: UploadedFile[];
}

@Injectable({
    providedIn: 'root'
})
export class UploadFileService {

    constructor(
        private readonly _init: AppInitService,
        private readonly _http: HttpClient,
        private readonly _session: SessionService
    ) { }

    /**
     * uploads files to SIPI
     * @param (file)
     */
    upload(file: FormData): Observable<UploadedFileResponse> {

        const uploadUrl = `${this._init.dspIiifConfig.iiifUrl}/upload`;

        // checks if user is logged in
        const jwt = this._session.getSession()?.user.jwt;
        const params = new HttpParams().set('token', jwt);

        // --> TODO in order to track the progress change below to true and 'events'
        const options = { params, reportProgress: false, observe: 'body' as 'body' };
        return this._http.post<UploadedFileResponse>(uploadUrl, file, options);
    }
}
