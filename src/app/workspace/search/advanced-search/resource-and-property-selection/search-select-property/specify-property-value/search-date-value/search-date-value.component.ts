import { Component, Inject, Input, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Constants, KnoraDate } from '@dasch-swiss/dsp-js';
import { JDNConvertibleCalendar } from 'jdnconvertiblecalendar';
import { CalendarHeaderComponent } from 'src/app/workspace/resource/values/date-value/calendar-header/calendar-header.component';
import { PropertyValue, Value, ValueLiteral } from '../operator';

// https://stackoverflow.com/questions/45661010/dynamic-nested-reactive-form-expressionchangedafterithasbeencheckederror
const resolvedPromise = Promise.resolve(null);

@Component({
    selector: 'app-search-date-value',
    templateUrl: './search-date-value.component.html',
    styleUrls: ['./search-date-value.component.scss']
})
export class SearchDateValueComponent implements OnInit, OnDestroy, PropertyValue {

    // parent FormGroup
    @Input() formGroup: FormGroup;

    type = Constants.DateValue;

    form: FormGroup;

    // custom header for the datepicker
    // headerComponent = CalendarHeaderComponent;

    constructor(@Inject(FormBuilder) private _fb: FormBuilder) {
    }

    ngOnInit() {

        // init datepicker
        this.form = this._fb.group({
            dateValue: [null, Validators.compose([Validators.required])]
        });

        this.form.valueChanges.subscribe((data) => {
            // console.log(data.dateValue);
        });

        resolvedPromise.then(() => {
            // add form to the parent form group
            this.formGroup.addControl('propValue', this.form);
        });

    }

    ngOnDestroy() {

        // remove form from the parent form group
        resolvedPromise.then(() => {
            this.formGroup.removeControl('propValue');
        });

    }

    getValue(): Value {

        const dateObj: KnoraDate = this.form.value.dateValue;

        // get calendar format
        const calendarFormat = dateObj.calendar;
        // set date object as string
        const dateString = `${calendarFormat.toUpperCase()}:${dateObj.year}-${dateObj.month}-${dateObj.day}:${dateObj.year}-${dateObj.month}-${dateObj.day}`;

        return new ValueLiteral(String(dateString), Constants.KnoraApi + '/ontology/knora-api/simple/v2' + Constants.HashDelimiter + 'Date');
    }

}
