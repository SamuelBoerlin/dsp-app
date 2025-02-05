import { Component, EventEmitter, Inject, Input, OnChanges, OnDestroy, OnInit, Output } from '@angular/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { PageEvent } from '@angular/material/paginator';
import {
    ApiResponseData,
    ApiResponseError,
    CardinalityUtil,
    Constants, CountQueryResponse,
    DeleteResource,
    DeleteResourceResponse,
    DeleteValue,
    IHasPropertyWithPropertyDefinition,
    KnoraApiConnection,
    PermissionUtil,
    ProjectResponse,
    PropertyDefinition,
    ReadColorValue,
    ReadLinkValue,
    ReadProject,
    ReadResource,
    ReadResourceSequence,
    ReadTextValueAsXml,
    ReadUser,
    ReadValue,
    ResourcePropertyDefinition,
    UpdateResourceMetadata,
    UpdateResourceMetadataResponse,
    UserResponse
} from '@dasch-swiss/dsp-js';
import { Subscription } from 'rxjs';
import { DspApiConnectionToken } from 'src/app/main/declarations/dsp-api-tokens';
import { ConfirmationWithComment, DialogComponent } from 'src/app/main/dialog/dialog.component';
import { ErrorHandlerService } from 'src/app/main/error/error-handler.service';
import { NotificationService } from 'src/app/main/services/notification.service';
import { DspResource } from '../dsp-resource';
import { RepresentationConstants } from '../representation/file-representation';
import { IncomingService } from '../services/incoming.service';
import { ResourceService } from '../services/resource.service';
import { UserService } from '../services/user.service';
import {
    AddedEventValue,
    DeletedEventValue,
    Events,
    UpdatedEventValues,
    ValueOperationEventService
} from '../services/value-operation-event.service';
import { ValueService } from '../services/value.service';

// object of property information from ontology class, properties and property values
export interface PropertyInfoValues {
    guiDef: IHasPropertyWithPropertyDefinition;
    propDef: PropertyDefinition;
    values: ReadValue[];
}

@Component({
    selector: 'app-properties',
    templateUrl: './properties.component.html',
    styleUrls: ['./properties.component.scss']
})
export class PropertiesComponent implements OnInit, OnChanges, OnDestroy {

    /**
     * input `resource` of properties component:
     * complete information about the current resource
     */
    @Input() resource: DspResource;

    /**
     * input `displayProjectInfo` of properties component:
     * display project info or not; "This resource belongs to project XYZ"
     */
    @Input() displayProjectInfo = false;

    /**
     * does the logged-in user has system or project admin permissions?
     */
    @Input() adminPermissions = false;

    /**
     * is the logged-in user project member?
     */
    @Input() editPermissions = false;

    /**
     * in case properties belongs to an annotation (e.g. region in still images)
     * in this case we don't have to display the isRegionOf property
     */
    @Input() isAnnotation = false;

    @Input() valueUuidToHighlight: string;

    /**
     * output `referredProjectClicked` of resource view component:
     * can be used to go to project page
     */
    @Output() referredProjectClicked: EventEmitter<ReadProject> = new EventEmitter<ReadProject>();

    /**
     * output `referredProjectHovered` of resource view component:
     * can be used for preview when hovering on project
     */
    @Output() referredProjectHovered: EventEmitter<ReadProject> = new EventEmitter<ReadProject>();

    /**
     * output `referredResourceClicked` of resource view component:
     * can be used to open resource
     */
    @Output() referredResourceClicked: EventEmitter<ReadLinkValue> = new EventEmitter<ReadLinkValue>();

    /**
     * output `referredResourceHovered` of resource view component:
     * can be used for preview when hovering on resource
     */
    @Output() referredResourceHovered: EventEmitter<ReadLinkValue> = new EventEmitter<ReadLinkValue>();

    @Output() regionColorChanged: EventEmitter<ReadColorValue> = new EventEmitter<ReadColorValue>();

    lastModificationDate: string;

    deletedResource = false;

    addButtonIsVisible: boolean; // used to toggle add value button
    addValueFormIsVisible: boolean; // used to toggle add value form field
    propID: string; // used in template to show only the add value form of the corresponding value

    valueOperationEventSubscriptions: Subscription[] = []; // array of ValueOperationEvent subscriptions

    representationConstants = RepresentationConstants;

    booleanValueTypeIri = Constants.BooleanValue;

    hasIncomingLinkIri = Constants.KnoraApiV2 + Constants.HashDelimiter + 'hasIncomingLinkValue';

    project: ReadProject;
    user: ReadUser;

    incomingLinkResources: ReadResource[] = [];
    pageEvent: PageEvent;
    numberOffAllIncomingLinkRes: number;
    loading = false;

    showAllProps = false;   // show or hide empty properties

    constructor(
        @Inject(DspApiConnectionToken) private _dspApiConnection: KnoraApiConnection,
        private _dialog: MatDialog,
        private _errorHandler: ErrorHandlerService,
        private _incomingService: IncomingService,
        private _notification: NotificationService,
        private _resourceService: ResourceService,
        private _userService: UserService,
        private _valueOperationEventService: ValueOperationEventService,
        private _valueService: ValueService,
    ) { }

    ngOnInit(): void {
        // reset the page event
        this.pageEvent = new PageEvent();
        this.pageEvent.pageIndex = 0;

        this._getIncomingLinks();

        if (this.resource.res) {
            // get user permissions
            const allPermissions = PermissionUtil.allUserPermissions(
                this.resource.res.userHasPermission as 'RV' | 'V' | 'M' | 'D' | 'CR'
            );

            // get last modification date
            this.lastModificationDate = this.resource.res.lastModificationDate;

            // if user has modify permissions, set addButtonIsVisible to true so the user see's the add button
            this.addButtonIsVisible = allPermissions.indexOf(PermissionUtil.Permissions.M) !== -1;
        }

        // listen for the AddValue event to be emitted and call hideAddValueForm()
        // this._valueOperationEventService.on(Events.ValueAdded, () => this.hideAddValueForm())
        this.valueOperationEventSubscriptions = [];

        // subscribe to the ValueOperationEventService and listen for an event to be emitted
        this.valueOperationEventSubscriptions.push(this._valueOperationEventService.on(
            Events.ValueAdded, (newValue: AddedEventValue) => {
                if (newValue) {
                    this.lastModificationDate = newValue.addedValue.valueCreationDate;
                    this.addValueToResource(newValue.addedValue);
                    this.hideAddValueForm();
                }
            }));

        this.valueOperationEventSubscriptions.push(this._valueOperationEventService.on(
            Events.ValueUpdated, (updatedValue: UpdatedEventValues) => {
                this.lastModificationDate = updatedValue.updatedValue.valueCreationDate;
                this.updateValueInResource(updatedValue.currentValue, updatedValue.updatedValue);
                this.hideAddValueForm();
            }));

        this.valueOperationEventSubscriptions.push(this._valueOperationEventService.on(
            Events.ValueDeleted, (deletedValue: DeletedEventValue) => {
                // the DeletedEventValue does not contain a creation or last modification date
                // so, we have to grab it from res info
                this._getLastModificationDate(this.resource.res.id);
                this.deleteValueFromResource(deletedValue.deletedValue);
            }));

        // keep the information if the user wants to display all properties or not
        if (localStorage.getItem('showAllProps')) {
            this.showAllProps = JSON.parse(localStorage.getItem('showAllProps'));
        } else {
            localStorage.setItem('showAllProps', JSON.stringify(this.showAllProps));
        }
    }

    ngOnChanges(): void {
        // get project information
        this._dspApiConnection.admin.projectsEndpoint.getProjectByIri(this.resource.res.attachedToProject).subscribe(
            (response: ApiResponseData<ProjectResponse>) => {
                this.project = response.body.project;
            },
            (error: ApiResponseError) => {
                this._errorHandler.showMessage(error);
            }
        );

        // get user information
        this._userService.getUser(this.resource.res.attachedToUser).subscribe(
            (response: UserResponse) => {
                this.user = response.user;
            }
        );
    }

    ngOnDestroy() {
        // unsubscribe from the event bus when component is destroyed
        // if (this.valueOperationEventSubscription !== undefined) {
        //     this.valueOperationEventSubscription.unsubscribe();
        // }
        // unsubscribe from the ValueOperationEventService when component is destroyed
        if (this.valueOperationEventSubscriptions !== undefined) {
            this.valueOperationEventSubscriptions.forEach(sub => sub.unsubscribe());
        }
    }

    /**
     * opens project
     * @param linkValue
     */
    openProject(project: ReadProject) {
        window.open('/project/' + project.shortcode, '_blank');
    }

    previewProject(project: ReadProject) {
        // --> TODO: pop up project preview on hover
    }

    /**
     * goes to the next page of the incoming link pagination
     * @param page
     */
    goToPage(page: PageEvent) {
        this.pageEvent = page;
        this._getIncomingLinks();
    }

    /**
     * opens resource
     * @param linkValue
     */
    openResource(linkValue: ReadLinkValue | string) {
        const iri = ((typeof linkValue == 'string') ? linkValue : linkValue.linkedResourceIri);
        const path = this._resourceService.getResourcePath(iri);
        window.open('/resource' + path, '_blank');
    }

    previewResource(linkValue: ReadLinkValue) {
        // --> TODO: pop up resource preview on hover
    }

    openDialog(type: 'delete' | 'erase' | 'edit') {
        const dialogConfig: MatDialogConfig = {
            width: '560px',
            maxHeight: '80vh',
            position: {
                top: '112px'
            },
            data: { mode: type + 'Resource', title: this.resource.res.label }
        };

        const dialogRef = this._dialog.open(
            DialogComponent,
            dialogConfig
        );

        dialogRef.afterClosed().subscribe((answer: ConfirmationWithComment) => {

            if (answer.confirmed === true) {

                if (type !== 'edit') {

                    const payload = new DeleteResource();
                    payload.id = this.resource.res.id;
                    payload.type = this.resource.res.type;
                    payload.deleteComment = answer.comment ? answer.comment : undefined;
                    payload.lastModificationDate = this.lastModificationDate;
                    switch (type) {
                        case 'delete':
                            // delete the resource and refresh the view
                            this._dspApiConnection.v2.res.deleteResource(payload).subscribe(
                                (response: DeleteResourceResponse) => {
                                    // display notification and mark resource as 'deleted'
                                    this._notification.openSnackBar(`${response.result}: ${this.resource.res.label}`);
                                    this.deletedResource = true;
                                },
                                (error: ApiResponseError) => {
                                    this._errorHandler.showMessage(error);
                                }
                            );
                            break;

                        case 'erase':
                            // erase the resource and refresh the view
                            this._dspApiConnection.v2.res.eraseResource(payload).subscribe(
                                (response: DeleteResourceResponse) => {
                                    // display notification and mark resource as 'erased'
                                    this._notification.openSnackBar(`${response.result}: ${this.resource.res.label}`);
                                    this.deletedResource = true;
                                },
                                (error: ApiResponseError) => {
                                    this._errorHandler.showMessage(error);
                                }
                            );
                            break;
                    }
                } else {

                    // update resource's label if it has changed
                    if (this.resource.res.label !== answer.comment) {
                        const payload = new UpdateResourceMetadata();
                        payload.id = this.resource.res.id;
                        payload.type = this.resource.res.type;
                        payload.lastModificationDate = this.lastModificationDate;
                        payload.label = answer.comment;
                        this._dspApiConnection.v2.res.updateResourceMetadata(payload).subscribe(
                            (response: UpdateResourceMetadataResponse) => {
                                this.resource.res.label = payload.label;
                                this.lastModificationDate = response.lastModificationDate;
                            },
                            (error: ApiResponseError) => {
                                this._errorHandler.showMessage(error);
                            }
                        );
                    }
                }

            }
        });
    }

    /**
    * display message to confirm the copy of the citation link (ARK URL)
    */
    openSnackBar(message: string) {
        this._notification.openSnackBar(message);
    }

    /**
     * called from the template when the user clicks on the add button
     */
    showAddValueForm(prop: PropertyInfoValues, ev: Event) {
        ev.preventDefault();
        this.propID = prop.propDef.id;
        this.addValueFormIsVisible = true;
    }

    /**
     * called from the template when the user clicks on the cancel button
     */
    hideAddValueForm() {
        this.addValueFormIsVisible = false;
        this.addButtonIsVisible = true;
        this.propID = undefined;
    }

    /**
     * given a resource property, check if an add button should be displayed under the property values
     *
     * @param prop the resource property
     */
    addValueIsAllowed(prop: PropertyInfoValues): boolean {

        // if the ontology flags this as a read-only property,
        // don't ever allow to add a value
        if (prop.propDef instanceof ResourcePropertyDefinition && !prop.propDef.isEditable) {
            return false;
        }

        const isAllowed = CardinalityUtil.createValueForPropertyAllowed(
            prop.propDef.id, prop.values.length, this.resource.res.entityInfo.classes[this.resource.res.type]);

        // check if:
        // cardinality allows for a value to be added
        // value component does not already have an add value form open
        // user has write permissions
        return isAllowed && this.propID !== prop.propDef.id && this.addButtonIsVisible;
    }

    /**
     * updates the UI in the event of a new value being added to show the new value
     *
     * @param valueToAdd the value to add to the end of the values array of the filtered property
     */
    addValueToResource(valueToAdd: ReadValue): void {
        if (this.resource.resProps) {
            this.resource.resProps
                .filter(propInfoValueArray =>
                    propInfoValueArray.propDef.id === valueToAdd.property) // filter to the correct property
                .forEach(propInfoValue => {
                    propInfoValue.values.push(valueToAdd); // push new value to array
                });

            if (valueToAdd instanceof ReadTextValueAsXml) {
                this._updateStandoffLinkValue();
            }
        } else {
            // --> TODO: better error handler!
            console.warn('No properties exist for this resource');
        }
    }

    /**
     * updates the UI in the event of an existing value being updated to show the updated value
     *
     * @param valueToReplace the value to be replaced within the values array of the filtered property
     * @param updatedValue the value to replace valueToReplace with
     */
    updateValueInResource(valueToReplace: ReadValue, updatedValue: ReadValue): void {
        if (this.resource.resProps && updatedValue !== null) {
            this.resource.resProps
                .filter(propInfoValueArray =>
                    propInfoValueArray.propDef.id === valueToReplace.property) // filter to the correct property
                .forEach(filteredpropInfoValueArray => {
                    filteredpropInfoValueArray.values.forEach((val, index) => { // loop through each value of the current property
                        if (val.id === valueToReplace.id) { // find the value that should be updated using the id of valueToReplace
                            filteredpropInfoValueArray.values[index] = updatedValue; // replace value with the updated value
                        }
                    });
                });
            if (updatedValue instanceof ReadTextValueAsXml) {
                this._updateStandoffLinkValue();
            }
            if (updatedValue instanceof ReadColorValue) {
                this.regionColorChanged.emit();
            }
        } else {
            console.warn('No properties exist for this resource');
        }
    }

    /**
     * given a resource property, check if its cardinality allows a value to be deleted
     *
     * @param prop the resource property
     */
    deleteValueIsAllowed(prop: PropertyInfoValues): boolean {
        const isAllowed = CardinalityUtil.deleteValueForPropertyAllowed(
            prop.propDef.id, prop.values.length, this.resource.res.entityInfo.classes[this.resource.res.type]);

        return isAllowed;
    }

    /**
     * updates the UI in the event of an existing value being deleted
     *
     * @param valueToDelete the value to remove from the values array of the filtered property
     */
    deleteValueFromResource(valueToDelete: DeleteValue): void {
        if (this.resource.resProps) {
            this.resource.resProps
                .filter(propInfoValueArray =>  // filter to the correct type
                    this._valueService.compareObjectTypeWithValueType(propInfoValueArray.propDef.objectType, valueToDelete.type))
                .forEach(filteredpropInfoValueArray => {
                    filteredpropInfoValueArray.values.forEach((val, index) => { // loop through each value of the current property
                        if (val.id === valueToDelete.id) { // find the value that was deleted using the id
                            filteredpropInfoValueArray.values.splice(index, 1); // remove the value from the values array

                            if (val instanceof ReadTextValueAsXml) {
                                this._updateStandoffLinkValue();
                            }
                        }
                    });
                }
                );
        } else {
            console.warn('No properties exist for this resource');
        }
    }

    toggleAllProps(status: boolean) {
        this.showAllProps = !status;
        localStorage.setItem('showAllProps', JSON.stringify(this.showAllProps));
    }

    /**
     * gets the number of incoming links and gets the incoming links.
     * @private
     */
    private _getIncomingLinks() {
        this.loading = true;

        if (this.pageEvent.pageIndex === 0) {
            this._incomingService.getIncomingLinks(this.resource.res.id, this.pageEvent.pageIndex, true).subscribe(
                (response: CountQueryResponse) => {
                    this.numberOffAllIncomingLinkRes = response.numberOfResults;
                }
            );
        }

        this._incomingService.getIncomingLinks(this.resource.res.id, this.pageEvent.pageIndex).subscribe(
            (response: ReadResourceSequence) => {
                if (response.resources.length > 0) {
                    this.incomingLinkResources = response.resources;
                }
                this.loading = false;
            }, (error: ApiResponseError) => {
                this.loading = false;
            }
        );
    }

    /**
     * updates the standoff link value for the resource being displayed.
     *
     */
    private _updateStandoffLinkValue(): void {

        if (this.resource.res === undefined) {
            // this should never happen:
            // if the user was able to click on a standoff link,
            // then the resource must have been initialised before.
            return;
        }

        const gravsearchQuery = `
     PREFIX knora-api: <http://api.knora.org/ontology/knora-api/simple/v2#>
     CONSTRUCT {
         ?res knora-api:isMainResource true .
         ?res knora-api:hasStandoffLinkTo ?target .
     } WHERE {
         BIND(<${this.resource.res.id}> as ?res) .
         OPTIONAL {
             ?res knora-api:hasStandoffLinkTo ?target .
         }
     }
     OFFSET 0
     `;

        this._dspApiConnection.v2.search.doExtendedSearch(gravsearchQuery).subscribe(
            (res: ReadResourceSequence) => {

                // one resource is expected
                if (res.resources.length !== 1) {
                    return;
                }

                const newStandoffLinkVals = res.resources[0].getValuesAs(Constants.HasStandoffLinkToValue, ReadLinkValue);

                this.resource.resProps.filter(
                    resPropInfoVal => (resPropInfoVal.propDef.id === Constants.HasStandoffLinkToValue)
                ).forEach(
                    standoffLinkResPropInfoVal => {
                        // delete all the existing standoff link values
                        standoffLinkResPropInfoVal.values = [];
                        // push standoff link values retrieved for the resource
                        newStandoffLinkVals.forEach(
                            standoffLinkVal => {
                                standoffLinkResPropInfoVal.values.push(standoffLinkVal);
                            }
                        );
                    });

            },
            err => {
                console.error(err);
            }
        );

    }

    private _getLastModificationDate(resId: string) {
        this._dspApiConnection.v2.res.getResource(resId).subscribe(
            (res: ReadResource) => this.lastModificationDate = res.lastModificationDate
        );
    }
}
