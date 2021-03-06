import React, { Component } from 'react';
import Api from './Api';

interface FooterProps {
}
interface FooterState {
  version: string;
}

export default class Footer extends Component<FooterProps, FooterState> {

  public static defaultProps: FooterState = {
    version: '(Loading...)'
  };

  private api: Api;

  constructor(props: FooterProps) {
      super(props);
      this.state = {version: ''};
      this.api = Api.create();
    }
  
  override componentDidMount() {
    this.api.GetVersion()
      .then( data => {
          this.setState({version: data.version});
      })
      .catch( err => {
        console.log(err.message)
        this.setState({version: 'Error'});
      });
  }

  override render(): JSX.Element {
      return (
        <div>
          <p>API ${this.state.version}</p>
        </div>
      );
    }
    
}