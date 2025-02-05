import { Pipe, PipeTransform } from '@angular/core';
import { KnoraDate } from '@dasch-swiss/dsp-js';

@Pipe({
    name: 'knoraDate'
})
export class KnoraDatePipe implements PipeTransform {

    transform(date: KnoraDate, format?: string, displayOptions?: 'era' | 'calendar' | 'calendarOnly' | 'all'): string {
        if (!(date instanceof KnoraDate)) {
            // console.error('Non-KnoraDate provided. Expected a valid KnoraDate');
            return '';
        }

        const formattedString = this.getFormattedString(date, format);

        if (displayOptions) {
            return this.addDisplayOptions(date, formattedString, displayOptions);
        } else {
            return formattedString;
        }
    }

    // ensures that day and month are always two digits
    leftPadding(value: number): string {
        if (value !== undefined) {
            return ('0' + value).slice(-2);
        } else {
            return null;
        }
    }

    // add the era, calendar, or both to the result returned by the pipe
    addDisplayOptions(date: KnoraDate, value: string, options: string): string {
        switch (options) {
            case 'era':
                // displays date with era; era only in case of BCE
                return value + (date.era === 'noEra' ? '' : ((date.era === 'BCE' || date.era === 'AD') ? ' ' + date.era : ''));
            case 'calendar':
                // displays date without era but with calendar type
                return value + ' ' + this._titleCase(date.calendar);
            case 'calendarOnly':
                // displays only the selected calendar type without any data
                return this._titleCase(date.calendar);
            case 'all':
                // displays date with era (only as BCE) and selected calendar type
                return value + (date.era === 'noEra' ? '' : (date.era === 'BCE' ? ' ' + date.era : '')) + ' ' + this._titleCase(date.calendar);
        }
    }

    getFormattedString(date: KnoraDate, format: string): string {
        switch (format) {
            case 'dd.MM.YYYY':
                if (date.precision === 2) {
                    return `${this.leftPadding(date.day)}.${this.leftPadding(date.month)}.${date.year}`;
                } else if (date.precision === 1) {
                    return `${this.leftPadding(date.month)}.${date.year}`;
                } else {
                    return `${date.year}`;
                }
            case 'dd-MM-YYYY':
                if (date.precision === 2) {
                    return `${this.leftPadding(date.day)}-${this.leftPadding(date.month)}-${date.year}`;
                } else if (date.precision === 1) {
                    return `${this.leftPadding(date.month)}-${date.year}`;
                } else {
                    return `${date.year}`;
                }
            case 'MM/dd/YYYY':
                if (date.precision === 2) {
                    return `${this.leftPadding(date.month)}/${this.leftPadding(date.day)}/${date.year}`;
                } else if (date.precision === 1) {
                    return `${this.leftPadding(date.month)}/${date.year}`;
                } else {
                    return `${date.year}`;
                }
            default:
                if (date.precision === 2) {
                    return `${this.leftPadding(date.day)}.${this.leftPadding(date.month)}.${date.year}`;
                } else if (date.precision === 1) {
                    return `${this.leftPadding(date.month)}.${date.year}`;
                } else {
                    return `${date.year}`;
                }
        }
    }

    /**
     * returns a string in Title Case format
     * It's needed to transform a calendar name e.g. 'GREGORIAN' into 'Gregorian'
     *
     * @param str
     * @returns string
     */
    private _titleCase(str: string): string {
        return str.split(' ').map(w => w[0].toUpperCase() + w.substr(1).toLowerCase()).join(' ');
    }

}
